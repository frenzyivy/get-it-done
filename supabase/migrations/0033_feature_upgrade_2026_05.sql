-- Feature upgrade — May 2026
--
-- Adds schema for the 9-phase upgrade brief (specs/get-it-done-upgrade-spec.md).
-- This migration is the prerequisite for every UI phase that follows.
--
-- Naming reconciliation with the brief:
--   * brief's `time_blocks`     -> `tracked_sessions` (extended in this migration)
--                                  + existing `planned_blocks`. We do NOT collapse
--                                  them into one table — every existing reader of
--                                  tracked_sessions (Insights, Schedule, Timeline,
--                                  streaks) keeps working unchanged.
--   * brief's `user_settings`   -> `user_preferences` (the existing table).
--   * brief's `today_for_date`  -> existing `tasks.planned_for_date`. Only
--                                  `today_sequence` is added.
--
-- Idempotent: every ADD / CREATE uses IF NOT EXISTS so partial re-runs are safe.

-- =====================================================================
-- 1. tasks: matrix quadrant, today sequence, last progress marker
-- =====================================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS matrix_quadrant TEXT
    DEFAULT 'unsorted',
  ADD COLUMN IF NOT EXISTS today_sequence INTEGER,
  ADD COLUMN IF NOT EXISTS last_progress_at TIMESTAMPTZ;

-- CHECK constraint is added separately so the IF NOT EXISTS path above
-- doesn't double-add it. Drop-and-recreate keeps the migration re-runnable.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_matrix_quadrant_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_matrix_quadrant_check
  CHECK (matrix_quadrant IN ('do_first','schedule','delegate','drop','unsorted'));

-- Index: Today view fetches "tasks for this date in sequence order".
-- Reuses the existing planned_for_date column (= brief's today_for_date).
CREATE INDEX IF NOT EXISTS idx_tasks_today_sequence
  ON tasks (user_id, planned_for_date, today_sequence)
  WHERE planned_for_date IS NOT NULL;

-- Index: Matrix view fetches all open tasks grouped by quadrant.
CREATE INDEX IF NOT EXISTS idx_tasks_matrix_quadrant
  ON tasks (user_id, matrix_quadrant);

-- Index: warning state queries scan in_progress tasks ordered by last_progress_at.
CREATE INDEX IF NOT EXISTS idx_tasks_last_progress_at
  ON tasks (user_id, last_progress_at)
  WHERE last_progress_at IS NOT NULL;

-- One-time backfill of last_progress_at from the most recent tracked_sessions
-- row on the task (or its subtasks). Safe to re-run — UPDATE only writes to
-- rows where the new value differs.
WITH last_session AS (
  SELECT
    COALESCE(ts.task_id, st.task_id) AS task_id,
    MAX(COALESCE(ts.ended_at, ts.started_at)) AS last_at
  FROM tracked_sessions ts
  LEFT JOIN subtasks st ON st.id = ts.subtask_id
  WHERE COALESCE(ts.task_id, st.task_id) IS NOT NULL
  GROUP BY COALESCE(ts.task_id, st.task_id)
)
UPDATE tasks t
   SET last_progress_at = ls.last_at
  FROM last_session ls
 WHERE t.id = ls.task_id
   AND (t.last_progress_at IS DISTINCT FROM ls.last_at);

-- =====================================================================
-- 2. tracked_sessions: break_label, manually_entered, note, block_type
-- =====================================================================
-- The brief's `time_blocks(block_type IN ('tracked','planned','break'))` maps
-- to: keep planned in `planned_blocks`; let `tracked_sessions` carry both
-- tracked work AND user-labelled breaks via a new block_type column.
ALTER TABLE tracked_sessions
  ADD COLUMN IF NOT EXISTS block_type TEXT NOT NULL DEFAULT 'tracked',
  ADD COLUMN IF NOT EXISTS break_label TEXT,
  ADD COLUMN IF NOT EXISTS break_auto_detected BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manually_entered BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE tracked_sessions DROP CONSTRAINT IF EXISTS tracked_sessions_block_type_check;
ALTER TABLE tracked_sessions
  ADD CONSTRAINT tracked_sessions_block_type_check
  CHECK (block_type IN ('tracked','break'));

-- Trigger to keep updated_at fresh, reusing the project's existing helper
-- (update_modified_column from 0007_updated_at_trigger.sql).
DROP TRIGGER IF EXISTS set_tracked_sessions_updated_at ON tracked_sessions;
CREATE TRIGGER set_tracked_sessions_updated_at
  BEFORE UPDATE ON tracked_sessions
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

COMMENT ON COLUMN tracked_sessions.block_type IS
  'tracked = user-worked session (the default, what live timers create). break = user-labelled or auto-detected gap. Planned intents live in planned_blocks, not here.';
COMMENT ON COLUMN tracked_sessions.manually_entered IS
  'TRUE for rows created or modified after the fact (Timeline retroactive add/edit). Honest Score discounts manually-entered totals from the auto-tracked baseline.';
COMMENT ON COLUMN tracked_sessions.break_auto_detected IS
  'TRUE if the row was suggested by gap-detection heuristics. Becomes FALSE the moment the user confirms or relabels it.';

-- =====================================================================
-- 3. weekly_goals: per-week goal storage
-- =====================================================================
CREATE TABLE IF NOT EXISTS weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,                     -- Sunday of the week (ISO Sun-Sat)
  goal_hours NUMERIC(4,1) NOT NULL CHECK (goal_hours BETWEEN 0 AND 168),
  working_days INTEGER NOT NULL DEFAULT 5 CHECK (working_days BETWEEN 1 AND 7),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, week_start)
);

ALTER TABLE weekly_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own weekly_goals" ON weekly_goals;
CREATE POLICY "Users manage own weekly_goals" ON weekly_goals
  FOR ALL USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_weekly_goals_updated_at ON weekly_goals;
CREATE TRIGGER set_weekly_goals_updated_at
  BEFORE UPDATE ON weekly_goals
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE INDEX IF NOT EXISTS idx_weekly_goals_user_week
  ON weekly_goals (user_id, week_start DESC);

-- =====================================================================
-- 4. projects.last_activity_at
-- =====================================================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- One-time backfill: most recent tracked-session end for any task linked to
-- the project. Re-runnable.
WITH last_proj_activity AS (
  SELECT
    tp.project_id,
    MAX(COALESCE(ts.ended_at, ts.started_at)) AS last_at
  FROM tracked_sessions ts
  JOIN task_projects tp ON tp.task_id = ts.task_id
  WHERE ts.block_type = 'tracked'
  GROUP BY tp.project_id
)
UPDATE projects p
   SET last_activity_at = lpa.last_at
  FROM last_proj_activity lpa
 WHERE p.id = lpa.project_id
   AND (p.last_activity_at IS DISTINCT FROM lpa.last_at);

CREATE INDEX IF NOT EXISTS idx_projects_last_activity
  ON projects (user_id, last_activity_at);

-- =====================================================================
-- 5. user_preferences: the upgrade brief's new toggles
-- =====================================================================
-- Note: the brief calls this table user_settings; the real table is
-- user_preferences (migration 0010).
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS edit_resets_status BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS edit_reset_fields TEXT[] NOT NULL
    DEFAULT ARRAY['title','estimate','project','subtasks']::TEXT[],
  ADD COLUMN IF NOT EXISTS warning_threshold_min INTEGER NOT NULL DEFAULT 20
    CHECK (warning_threshold_min BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS stale_project_days INTEGER NOT NULL DEFAULT 7
    CHECK (stale_project_days BETWEEN 1 AND 90),
  ADD COLUMN IF NOT EXISTS hide_completed_default BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS presence_detection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS presence_break_after_min INTEGER NOT NULL DEFAULT 5
    CHECK (presence_break_after_min BETWEEN 1 AND 60),
  ADD COLUMN IF NOT EXISTS presence_stop_after_min INTEGER NOT NULL DEFAULT 20
    CHECK (presence_stop_after_min BETWEEN 1 AND 240),
  ADD COLUMN IF NOT EXISTS presence_method TEXT NOT NULL DEFAULT 'mouse_keyboard';

ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_presence_method_check;
ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_presence_method_check
  CHECK (presence_method IN ('mouse_keyboard','webcam','mobile_motion'));

-- =====================================================================
-- 6. Helper view: stale projects (read-only)
-- =====================================================================
-- Exposes a per-project boolean `is_stale` driven by the user's configured
-- stale_project_days threshold. The List view's stale-nudge banner reads this.
-- Inherits RLS from underlying projects / user_preferences.
CREATE OR REPLACE VIEW v_project_staleness AS
SELECT
  p.id              AS project_id,
  p.user_id,
  p.last_activity_at,
  COALESCE(up.stale_project_days, 7) AS threshold_days,
  CASE
    WHEN p.status <> 'active' THEN FALSE
    WHEN p.last_activity_at IS NULL THEN
      -- Never active. Use created_at as the clock so brand-new projects
      -- aren't immediately flagged. The view assumes projects.created_at
      -- exists (it does — see 0019).
      (now() - p.created_at) > (COALESCE(up.stale_project_days, 7) || ' days')::interval
    ELSE
      (now() - p.last_activity_at) > (COALESCE(up.stale_project_days, 7) || ' days')::interval
  END               AS is_stale
FROM projects p
LEFT JOIN user_preferences up ON up.user_id = p.user_id;

COMMENT ON VIEW v_project_staleness IS
  'Per-project is_stale flag driven by user_preferences.stale_project_days. Only "active" projects can be stale; "paused"/"completed"/"archived" are never flagged.';
