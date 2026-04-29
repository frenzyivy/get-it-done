-- SPEC § Data model changes — derived task status.
--
-- effective_status is computed, not stored:
--   * tasks.completed_at IS NOT NULL                                  -> 'done'
--   * any tracked_sessions row on task or its subtasks has duration   -> 'in_progress'
--   * any tracked_sessions row on task or its subtasks is open        -> 'in_progress'
--   * else                                                            -> 'todo'
--
-- The legacy tasks.status column from 0003 is intentionally ignored. New
-- queries should JOIN v_task_status; tasks.status will be retired in a later
-- migration once all callers are migrated.
--
-- Reads tracked_sessions (migration 0012), not the older time_sessions table.
-- Idempotent via CREATE OR REPLACE.

CREATE OR REPLACE VIEW v_task_status AS
SELECT
  t.id,
  t.user_id,
  CASE
    WHEN t.completed_at IS NOT NULL THEN 'done'
    WHEN EXISTS (
      SELECT 1 FROM tracked_sessions ts
       WHERE ts.task_id = t.id
         AND COALESCE(ts.duration_seconds, 0) > 0
    )
      OR EXISTS (
      SELECT 1 FROM tracked_sessions ts
        JOIN subtasks st ON st.id = ts.subtask_id
       WHERE st.task_id = t.id
         AND COALESCE(ts.duration_seconds, 0) > 0
    )
      OR EXISTS (
      -- An open (still-running) session also promotes to in_progress
      SELECT 1 FROM tracked_sessions ts
       WHERE ts.ended_at IS NULL
         AND (
           ts.task_id = t.id
           OR ts.subtask_id IN (SELECT id FROM subtasks WHERE task_id = t.id)
         )
    ) THEN 'in_progress'
    ELSE 'todo'
  END AS effective_status
FROM tasks t;

-- RLS on the view is inherited from the underlying tables (tasks, subtasks,
-- tracked_sessions all enforce auth.uid() = user_id), so no extra policy needed.
COMMENT ON VIEW v_task_status IS
  'Per-task derived status: done | in_progress | todo. Computed from completed_at and tracked_sessions. JOIN this view; do not read tasks.status directly.';
