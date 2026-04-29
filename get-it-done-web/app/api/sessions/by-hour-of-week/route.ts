import 'server-only';
import type { NextRequest } from 'next/server';
import {
  requireUser,
  withCors,
  preflight,
  badRequest,
  serverError,
} from '../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

const VALID_RANGES = new Set(['7d', '30d', '90d']);

interface SessionRow {
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

// GET /api/sessions/by-hour-of-week?range=30d
//
// Returns a 7-by-24 matrix of total tracked seconds, bucketed by
// (day_of_week, hour_of_day) of started_at in the user's timezone.
//
// Day index: 0 = Sunday … 6 = Saturday (matches JS Date.getDay()).
// Hour index: 0 … 23.
//
// Bucketing is by started_at only — sessions that cross hour or midnight
// boundaries land entirely in their start bucket. This matches the
// directional-signal use case (heatmap visual); precise splitting is out
// of scope.
export async function GET(req: NextRequest) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const range = req.nextUrl.searchParams.get('range') ?? '30d';
  if (!VALID_RANGES.has(range)) {
    return withCors(badRequest('range must be one of 7d, 30d, 90d'));
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;

  // Resolve the user's timezone from user_preferences. Defaults to UTC if the
  // row doesn't exist (e.g., signup race) or the column is empty.
  const { data: prefs, error: prefErr } = await supa
    .from('user_preferences')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();
  if (prefErr) return withCors(serverError(prefErr.message));
  const timezone = prefs?.timezone || 'UTC';

  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  const { data: sessions, error: sessErr } = await supa
    .from('tracked_sessions')
    .select('started_at, ended_at, duration_seconds')
    .eq('user_id', user.id)
    .gte('started_at', sinceIso)
    .not('duration_seconds', 'is', null);
  if (sessErr) return withCors(serverError(sessErr.message));

  // Initialize a 7-day x 24-hour matrix of zeros.
  const matrix: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));

  // Phase 6 hardening — overlap bucketing. The previous implementation
  // assigned each session entirely to its `started_at` hour, which mis-bucketed
  // long sessions, hour-crossers, and midnight-crossers in the user's tz. Now
  // we walk the session's [start, end) window in 1-second increments and
  // attribute each second to the correct (day-of-week, hour) cell *in the
  // user's timezone*. To keep this O(seconds), we step by hour boundaries:
  // for each session, find the first tz-local hour boundary at or after start,
  // attribute (boundary - start) seconds to the start cell, then step hour by
  // hour until end. Worst case: a 24h session walks 24 hour boundaries — fine.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    hourCycle: 'h23',
  });
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  // Resolve the (dow, hour) cell for a given UTC ms moment, in user tz.
  function cellFor(ms: number): { dow: number; hour: number } | null {
    const parts = fmt.formatToParts(new Date(ms));
    let dow = -1;
    let hour = -1;
    for (const p of parts) {
      if (p.type === 'weekday') dow = dayMap[p.value] ?? -1;
      else if (p.type === 'hour') hour = Number.parseInt(p.value, 10);
    }
    if (dow < 0 || hour < 0 || hour > 23) return null;
    return { dow, hour };
  }

  for (const row of (sessions ?? []) as SessionRow[]) {
    const seconds = row.duration_seconds ?? 0;
    if (seconds <= 0) continue;
    const startMs = new Date(row.started_at).getTime();
    // Prefer the recorded ended_at when available (most precise). Fall back
    // to start + duration_seconds for older rows that may have a duration but
    // no ended_at (shouldn't happen in current schema, but defensive).
    const endMs = row.ended_at
      ? new Date(row.ended_at).getTime()
      : startMs + seconds * 1000;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

    let cursorMs = startMs;
    while (cursorMs < endMs) {
      const cell = cellFor(cursorMs);
      if (!cell) break;
      // Find the next tz-local hour boundary strictly after cursor. Stepping
      // by 1ms then by Intl-resolved hour edges is overkill; instead, compute
      // the boundary as cursor + (3600s − seconds-into-hour). Seconds-into-hour
      // is derived by parsing the cursor's tz-local minute + second parts.
      const tzParts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
        hourCycle: 'h23',
      }).formatToParts(new Date(cursorMs));
      let m = 0;
      let s = 0;
      for (const p of tzParts) {
        if (p.type === 'minute') m = Number.parseInt(p.value, 10);
        else if (p.type === 'second') s = Number.parseInt(p.value, 10);
      }
      const intoHourSec = m * 60 + s;
      const remainingInHourSec = 3600 - intoHourSec;
      const nextBoundaryMs = cursorMs + remainingInHourSec * 1000;
      const sliceEndMs = Math.min(nextBoundaryMs, endMs);
      const sliceSec = Math.max(0, Math.round((sliceEndMs - cursorMs) / 1000));
      if (sliceSec > 0) matrix[cell.dow][cell.hour] += sliceSec;
      cursorMs = sliceEndMs;
    }
  }

  return withCors(
    Response.json({
      range,
      timezone,
      // Flat matrix indexed [day][hour]. 7 rows x 24 cols.
      seconds_by_day_hour: matrix,
    }),
  );
}
