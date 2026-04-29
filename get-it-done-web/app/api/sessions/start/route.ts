import 'server-only';
import { requireUser, withCors, preflight, badRequest, serverError } from '../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

// SPEC § Phase 1 step 2 — concurrent timers are explicitly allowed
// (migration 0015 dropped the unique-active partial index). This endpoint
// opens a new tracked_sessions row without closing existing active ones.
const VALID_MODES = new Set([
  'free',
  'pomodoro_25_5',
  'pomodoro_50_10',
  'open',
  'call_focus',
  'app_focus',
  'strict',
]);

const SELECT_COLS =
  'id, user_id, task_id, subtask_id, planned_block_id, started_at, ended_at, ' +
  'duration_seconds, mode, was_paused, drift_events, broken, broken_reason, ' +
  'planned_duration_seconds';

interface StartBody {
  task_id?: string;
  subtask_id?: string | null;
  mode?: string;
  planned_block_id?: string | null;
  planned_duration_seconds?: number | null;
}

// POST /api/sessions/start — open a new tracking session.
//
// Body: { task_id, subtask_id?, mode?, planned_block_id?, planned_duration_seconds? }
//   - task_id is required.
//   - mode defaults to 'open' (matches the store and Focus Lock 'Just Track' label).
//   - If a session is already active for the same (task_id, subtask_id) pair,
//     it is returned as-is — double-click on play is idempotent.
export async function POST(req: Request) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json().catch(() => null)) as StartBody | null;
  if (!body) return withCors(badRequest('invalid body'));

  const taskId = body.task_id;
  if (!taskId || typeof taskId !== 'string') {
    return withCors(badRequest('task_id required'));
  }

  const subtaskId = body.subtask_id ?? null;
  if (subtaskId !== null && typeof subtaskId !== 'string') {
    return withCors(badRequest('subtask_id must be a uuid string or null'));
  }

  const mode = body.mode ?? 'open';
  if (!VALID_MODES.has(mode)) {
    return withCors(badRequest(`invalid mode: ${mode}`));
  }

  const plannedBlockId = body.planned_block_id ?? null;
  const plannedDurationSeconds = body.planned_duration_seconds ?? null;
  if (
    plannedDurationSeconds !== null &&
    (typeof plannedDurationSeconds !== 'number' || plannedDurationSeconds <= 0)
  ) {
    return withCors(badRequest('planned_duration_seconds must be a positive number'));
  }

  // Phase 6 hardening — defense-in-depth: validate that the task belongs
  // to the current user BEFORE attempting the session insert. RLS does
  // catch this, but a clean 404 is friendlier than the FK error we'd hit
  // from the insert itself.
  const { data: taskRow, error: taskErr } = await supa
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (taskErr) return withCors(serverError(taskErr.message));
  if (!taskRow) return withCors(badRequest('task not found'));

  // Race-free idempotency via the new partial unique index from migration
  // 0028 (uniq_open_session_per_pair). Try INSERT first; if a concurrent
  // start created the row in the meantime, the unique violation (23505)
  // means we should SELECT and return the winning session instead.
  const { data: inserted, error: insErr } = await supa
    .from('tracked_sessions')
    .insert({
      user_id: user.id,
      task_id: taskId,
      subtask_id: subtaskId,
      planned_block_id: plannedBlockId,
      started_at: new Date().toISOString(),
      mode,
      planned_duration_seconds: plannedDurationSeconds,
    })
    .select(SELECT_COLS)
    .single();

  if (!insErr) {
    return withCors(Response.json({ session: inserted, reused: false }, { status: 201 }));
  }

  // 23505 = unique_violation. Anything else is a real error.
  if (insErr.code !== '23505') return withCors(serverError(insErr.message));

  // Idempotent reuse path: read the existing open row for this pair and
  // return it.
  let existingQuery = supa
    .from('tracked_sessions')
    .select(SELECT_COLS)
    .eq('user_id', user.id)
    .eq('task_id', taskId)
    .is('ended_at', null);
  existingQuery = subtaskId === null
    ? existingQuery.is('subtask_id', null)
    : existingQuery.eq('subtask_id', subtaskId);
  const { data: existing, error: existingErr } = await existingQuery.maybeSingle();
  if (existingErr) return withCors(serverError(existingErr.message));
  if (!existing) {
    // Race window between the unique violation and the SELECT — extremely
    // unlikely but surface the underlying insert error rather than a
    // misleading 200 with no body.
    return withCors(serverError('session insert conflicted but lookup found no open row'));
  }
  return withCors(Response.json({ session: existing, reused: true }));
}
