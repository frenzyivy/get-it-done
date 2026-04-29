import 'server-only';
import {
  requireUser,
  withCors,
  preflight,
  badRequest,
  serverError,
} from '../../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Ctx {
  params: Promise<{ id: string }>;
}

interface SessionRow {
  subtask_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

interface SubtaskBreakdown {
  subtask_id: string | null;
  total_seconds: number;
  is_active: boolean;
}

// GET /api/tasks/:id/time-summary
//
// Sums tracked_sessions.duration_seconds for every session linked to this
// task or any of its subtasks, plus live-elapsed seconds for any still-open
// sessions. Returns total + per-subtask breakdown.
//
// The breakdown also includes a synthetic { subtask_id: null } bucket for
// sessions tracked at the task level without a specific subtask.
export async function GET(_req: Request, ctx: Ctx) {
  const { id: taskId } = await ctx.params;
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  // Validate the task exists and belongs to the user before doing any work.
  // RLS would block other users' tasks anyway; this surfaces a 404-equivalent
  // 400 instead of returning an empty {total_seconds: 0} which would be
  // ambiguous to the client.
  const { data: task, error: taskErr } = await supa
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (taskErr) return withCors(serverError(taskErr.message));
  if (!task) return withCors(badRequest('task not found'));

  // Pull the full set of subtask ids so we can both filter sessions and
  // build a complete breakdown (subtasks with zero time still appear).
  const { data: subtasks, error: subErr } = await supa
    .from('subtasks')
    .select('id')
    .eq('task_id', taskId);
  if (subErr) return withCors(serverError(subErr.message));
  const subtaskIds = (subtasks ?? []).map((s) => s.id as string);

  // Phase 6 hardening — fetch via TWO queries instead of one PostgREST `or()`.
  // The previous single-query path inlined every subtask id into the URL via
  // `subtask_id.in.(uuid1,uuid2,...)` and capped at ~200 subtasks before hitting
  // PostgREST's ~8KB URL limit. Splitting trades one round-trip for unbounded
  // subtask count and dedupes any session matched by both filters in JS.
  const [taskSessionsRes, subtaskSessionsRes] = await Promise.all([
    supa
      .from('tracked_sessions')
      .select('id, subtask_id, started_at, ended_at, duration_seconds')
      .eq('user_id', user.id)
      .eq('task_id', taskId),
    subtaskIds.length > 0
      ? supa
          .from('tracked_sessions')
          .select('id, subtask_id, started_at, ended_at, duration_seconds')
          .eq('user_id', user.id)
          .in('subtask_id', subtaskIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);
  if (taskSessionsRes.error) return withCors(serverError(taskSessionsRes.error.message));
  if (subtaskSessionsRes.error) return withCors(serverError(subtaskSessionsRes.error.message));

  // Dedupe by id — a row with this task_id AND a non-null subtask_id under it
  // would be returned by both queries. Keeping it once is the correct behavior.
  const sessionMap = new Map<string, SessionRow & { id: string }>();
  for (const row of [
    ...(taskSessionsRes.data ?? []),
    ...(subtaskSessionsRes.data ?? []),
  ] as (SessionRow & { id: string })[]) {
    sessionMap.set(row.id, row);
  }
  const sessions = Array.from(sessionMap.values());

  const now = Date.now();
  let totalSeconds = 0;
  const bySubtask = new Map<string | null, SubtaskBreakdown>();

  // Seed every subtask with a zero bucket so the response shape is stable.
  bySubtask.set(null, { subtask_id: null, total_seconds: 0, is_active: false });
  for (const sid of subtaskIds) {
    bySubtask.set(sid, { subtask_id: sid, total_seconds: 0, is_active: false });
  }

  for (const row of sessions) {
    const elapsed =
      row.ended_at === null
        ? Math.max(0, Math.floor((now - new Date(row.started_at).getTime()) / 1000))
        : row.duration_seconds ?? 0;
    totalSeconds += elapsed;

    const key = row.subtask_id;
    const bucket = bySubtask.get(key) ?? {
      subtask_id: key,
      total_seconds: 0,
      is_active: false,
    };
    bucket.total_seconds += elapsed;
    if (row.ended_at === null) bucket.is_active = true;
    bySubtask.set(key, bucket);
  }

  return withCors(
    Response.json({
      task_id: taskId,
      total_seconds: totalSeconds,
      by_subtask: Array.from(bySubtask.values()),
    }),
  );
}
