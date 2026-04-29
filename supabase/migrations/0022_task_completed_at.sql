-- SPEC § Data model changes — tasks.completed_at.
--
-- Done is manual: a checkbox stamps completed_at = now(). The legacy
-- tasks.status column (migration 0003) stays writable for now so existing code
-- doesn't break; new code reads v_task_status (migration 0023) which treats
-- completed_at IS NOT NULL as the only signal for 'done'.
--
-- Idempotent.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Back-fill: any task already in status='done' gets completed_at = updated_at
-- (best-available stamp; the trigger from 0007 keeps updated_at fresh).
UPDATE tasks
   SET completed_at = updated_at
 WHERE status = 'done' AND completed_at IS NULL;

-- Partial index so the Done tab and analytics queries stay fast as the table grows.
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
  ON tasks (user_id, completed_at)
  WHERE completed_at IS NOT NULL;
