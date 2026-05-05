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

// GET /api/sessions/day-stats?date=YYYY-MM-DD
//
// Feature 15 — single round-trip aggregation for the Schedule Day header.
// Returns { planned_seconds, tracked_seconds } for the user's local-tz day.
// Tracked is closed sessions only — the running session is added client-side
// from useLiveTimers() so the value can tick every second without round trips.
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

  const { data, error: rpcErr } = await supa.rpc('get_day_stats', {
    p_user_id: user.id,
    p_date: date,
    p_timezone: timezone,
  });
  if (rpcErr) return withCors(serverError(rpcErr.message));

  const row = Array.isArray(data) ? data[0] : data;
  const plannedSeconds = Number(row?.planned_seconds ?? 0);
  const trackedSeconds = Number(row?.tracked_seconds ?? 0);

  return withCors(
    Response.json({
      date,
      timezone,
      planned_seconds: plannedSeconds,
      tracked_seconds: trackedSeconds,
    }),
  );
}
