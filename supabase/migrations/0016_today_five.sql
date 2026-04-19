-- New-spec-1 § Feature 6 — Today's 5
--
-- Adds a per-task `planned_for_date` so the dashboard can surface up to 5
-- tasks a user plans to tackle on a given day. The DailyGoalBar filters
-- tasks by `planned_for_date === today()` and sorts by `sort_order`.
--
-- NOTE: this file was lost locally and has been reconstructed from the code
-- that depends on it. The prod database already had this migration applied
-- (otherwise the Today's 5 UI wouldn't read/write the column successfully).
-- If the production schema has additional indexes or constraints, reconcile
-- before running on a fresh database.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS planned_for_date DATE;

-- The dashboard filters by this column every render; index for speed.
CREATE INDEX IF NOT EXISTS idx_tasks_planned_for_date
  ON tasks (user_id, planned_for_date)
  WHERE planned_for_date IS NOT NULL;
