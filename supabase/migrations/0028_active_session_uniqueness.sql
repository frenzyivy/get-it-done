-- Phase 6 hardening — concurrency fix for /api/sessions/start.
--
-- Migration 0015 dropped the strict "one active session per user" index
-- because we wanted concurrent timers across DIFFERENT (task, subtask)
-- pairs. But the SELECT-then-INSERT idempotency in /api/sessions/start
-- is still vulnerable to a race against itself: two simultaneous calls
-- with the same (user_id, task_id, subtask_id) can both miss the SELECT
-- and both INSERT, producing two open sessions for the same pair.
--
-- This index enforces "at most one OPEN session per (user, task, subtask)
-- pair" at the database layer. Distinct subtasks under the same task can
-- still run concurrently, and the same task can have a task-level session
-- (subtask_id IS NULL) plus per-subtask sessions — all unaffected.
--
-- Coalescing subtask_id NULL → '00000000-0000-0000-0000-000000000000' so
-- task-level sessions (subtask_id IS NULL) are also covered by the index
-- (PostgreSQL treats NULLs as distinct in unique indexes by default).
--
-- Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_session_per_pair
  ON public.tracked_sessions (
    user_id,
    task_id,
    COALESCE(subtask_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE ended_at IS NULL;

COMMENT ON INDEX public.uniq_open_session_per_pair IS
  'Phase 6 hardening: at most one open tracked_sessions row per (user, task, subtask) pair. NULL subtask_id is coalesced so task-level sessions are covered. Lets /api/sessions/start use INSERT ... ON CONFLICT for race-free idempotency.';
