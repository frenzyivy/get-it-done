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

interface SessionRow {
  id: string;
  task_id: string | null;
  subtask_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  mode: string | null;
}

// GET /api/sessions/by-day-detailed?date=YYYY-MM-DD
//
// Returns every session that *touches* the given local-tz day — meaning a
// session that starts the previous day but ends in this day, or starts in
// this day and ends the next, is included. Used by the Schedule view's
// "actual vs planned" overlay so each tracked block can be drawn on the
// timeline next to its planned counterpart.
export async function GET(req: NextRequest) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return withCors(badRequest('date is required (YYYY-MM-DD)'));
  }

  const { data: prefs, error: prefErr } = await supa
    .from('user_preferences')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();
  if (prefErr) return withCors(serverError(prefErr.message));
  const timezone = prefs?.timezone || 'UTC';

  // Pad +/- 1 day so any overlap is captured regardless of tz offset.
  const padDay = (iso: string, deltaDays: number): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const t = Date.UTC(y, m - 1, d) + deltaDays * 24 * 60 * 60 * 1000;
    return new Date(t).toISOString();
  };
  const sinceIso = padDay(date, -1);
  const untilIso = padDay(date, 2);

  const { data: sessions, error: sessErr } = await supa
    .from('tracked_sessions')
    .select('id, task_id, subtask_id, started_at, ended_at, duration_seconds, mode')
    .eq('user_id', user.id)
    .gte('started_at', sinceIso)
    .lt('started_at', untilIso);
  if (sessErr) return withCors(serverError(sessErr.message));

  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Filter to sessions whose [started_at, ended_at) overlaps the requested
  // day window in the user's tz. For active (no ended_at) sessions, treat
  // them as ending now.
  const out: SessionRow[] = [];
  const nowMs = Date.now();
  for (const row of (sessions ?? []) as SessionRow[]) {
    const startMs = new Date(row.started_at).getTime();
    const endMs = row.ended_at ? new Date(row.ended_at).getTime() : nowMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (endMs <= startMs) continue;

    // A session touches the day iff its start day === date OR its end day
    // === date OR its window strictly contains the day.
    const startDay = dayFmt.format(new Date(startMs));
    const endDay = dayFmt.format(new Date(endMs));
    if (startDay === date || endDay === date || (startDay < date && endDay > date)) {
      out.push(row);
    }
  }

  return withCors(
    Response.json({
      date,
      timezone,
      sessions: out,
    }),
  );
}
