import 'server-only';
import { requireUser, withCors, preflight, serverError } from '../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

const SELECT_COLS =
  'id, user_id, task_id, subtask_id, planned_block_id, started_at, ended_at, ' +
  'duration_seconds, mode, was_paused, drift_events, broken, broken_reason, ' +
  'planned_duration_seconds';

// GET /api/sessions/active — every session for the current user that hasn't
// been stopped yet.
//
// Concurrent timers are intentional (migration 0015). The Now Tracking banner
// picks the most-recent row and shows a "+N more" affordance when length > 1.
// Ordered ascending by started_at so the *oldest* still-active appears first
// — matches the store's fetchActiveSessions() ordering for parity.
export async function GET() {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const { data, error: qErr } = await supa
    .from('tracked_sessions')
    .select(SELECT_COLS)
    .eq('user_id', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: true });
  if (qErr) return withCors(serverError(qErr.message));

  return withCors(Response.json({ sessions: data ?? [] }));
}
