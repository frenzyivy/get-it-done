-- Feature 05 — explicit Break button. Track break time on the session row so
-- it can be subtracted from elapsed wall-clock time when computing tracked
-- work, and so the user can see how long they stepped away. Reports and
-- streaks key off duration_seconds, so they get the correct value
-- (excluding break) for free once the store math subtracts break from elapsed
-- before writing duration_seconds.

ALTER TABLE tracked_sessions
  ADD COLUMN IF NOT EXISTS break_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_on_break BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_break_started_at TIMESTAMPTZ;

COMMENT ON COLUMN tracked_sessions.break_seconds IS
  'Total accrued break time within this session (closed breaks only). Live break time, if is_on_break, is computed as now() - last_break_started_at and rolled into break_seconds on resume/stop.';
COMMENT ON COLUMN tracked_sessions.is_on_break IS
  'True while the user is on a break. duration_seconds does not accrue while this is true.';
COMMENT ON COLUMN tracked_sessions.last_break_started_at IS
  'When the current break started. NULL when is_on_break = false. Cleared on resume after rolling its delta into break_seconds.';

-- Defensive index — exclude any rows still on break in admin queries.
-- A normal stop clears is_on_break, but a crash + manual close could leave one.
CREATE INDEX IF NOT EXISTS idx_tracked_sessions_on_break
  ON tracked_sessions (user_id) WHERE is_on_break = true;
