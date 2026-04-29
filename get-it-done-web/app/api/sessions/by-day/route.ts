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
  started_at: string;
  duration_seconds: number | null;
}

// GET /api/sessions/by-day?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns total tracked seconds per local-calendar day in [from, to] (inclusive).
// Bucketing is by `started_at` only (sessions crossing midnight in the user's
// tz fall entirely in their start day). Aligns with /api/sessions/by-hour-of-week's
// directional-signal model. Precise overlap-splitting is on the Phase 6 backlog.
export async function GET(req: NextRequest) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  if (!from || !to) return withCors(badRequest('from and to are required (YYYY-MM-DD)'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return withCors(badRequest('from / to must be YYYY-MM-DD'));
  }

  // Resolve the user's tz from preferences. Default UTC.
  const { data: prefs, error: prefErr } = await supa
    .from('user_preferences')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();
  if (prefErr) return withCors(serverError(prefErr.message));
  const timezone = prefs?.timezone || 'UTC';

  // Pad the SQL window by one day on each side so timezone offset never
  // misses sessions that fall into the local range. Final filtering happens
  // in JS by formatted local date.
  const padDay = (iso: string, deltaDays: number): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const t = Date.UTC(y, m - 1, d) + deltaDays * 24 * 60 * 60 * 1000;
    return new Date(t).toISOString();
  };
  const sinceIso = padDay(from, -1);
  const untilIso = padDay(to, 2); // +2 to cover the full `to` day in any tz

  const { data: sessions, error: sessErr } = await supa
    .from('tracked_sessions')
    .select('started_at, duration_seconds')
    .eq('user_id', user.id)
    .gte('started_at', sinceIso)
    .lt('started_at', untilIso)
    .not('duration_seconds', 'is', null);
  if (sessErr) return withCors(serverError(sessErr.message));

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const out: Record<string, number> = {};
  for (const row of (sessions ?? []) as SessionRow[]) {
    const seconds = row.duration_seconds ?? 0;
    if (seconds <= 0) continue;
    const localDate = fmt.format(new Date(row.started_at)); // YYYY-MM-DD
    if (localDate < from || localDate > to) continue;
    out[localDate] = (out[localDate] ?? 0) + seconds;
  }

  return withCors(
    Response.json({
      from,
      to,
      timezone,
      seconds_by_day: out,
    }),
  );
}
