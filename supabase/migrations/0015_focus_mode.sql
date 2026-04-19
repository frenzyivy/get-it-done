-- New-spec-1 § Feature 4 + 5 — concurrent timers + focus modes
--
-- 1. Widen tracked_sessions.mode to include focus levels (open, call_focus,
--    app_focus, strict). Existing 'free' and pomodoro modes stay valid so
--    we don't lose history.
-- 2. Add drift_events (jsonb[]) so the full-screen Strict/App Focus mode can
--    record every time the user tabs away.
-- 3. Add tasks.allow_alarms (bool) — per-spec per-task override that lets
--    scheduled alerts still ring even during Strict Zone.
-- 4. Drop the `uniq_active_session_per_user` partial index so Feature 4
--    (concurrent timers) becomes possible. The application layer tracks
--    multiple active rows via activeSessions[].
-- 5. Add focus-related prefs to user_preferences.

-- =========================================================
-- tracked_sessions.mode — drop old check, add wider one
-- =========================================================
ALTER TABLE tracked_sessions
  DROP CONSTRAINT IF EXISTS tracked_sessions_mode_check;

ALTER TABLE tracked_sessions
  ADD CONSTRAINT tracked_sessions_mode_check
  CHECK (mode IN (
    'free',
    'pomodoro_25_5',
    'pomodoro_50_10',
    'open',
    'call_focus',
    'app_focus',
    'strict'
  ));

-- =========================================================
-- tracked_sessions.drift_events — jsonb array of
--   [{ started_at: timestamptz, ended_at: timestamptz, duration_seconds: int }]
-- =========================================================
ALTER TABLE tracked_sessions
  ADD COLUMN IF NOT EXISTS drift_events JSONB NOT NULL DEFAULT '[]'::jsonb;

-- =========================================================
-- Allow concurrent active timers (Feature 4)
-- =========================================================
DROP INDEX IF EXISTS uniq_active_session_per_user;

-- Replace with a non-unique index so the fetchActiveSessions() query stays fast.
CREATE INDEX IF NOT EXISTS idx_tracked_sessions_active
  ON tracked_sessions (user_id)
  WHERE ended_at IS NULL;

-- =========================================================
-- tasks.allow_alarms — per-task alarm passthrough for Strict mode
-- =========================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS allow_alarms BOOLEAN NOT NULL DEFAULT false;

-- =========================================================
-- user_preferences — focus session settings
-- =========================================================
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS announce_focus_sessions BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS focus_announce_phrase TEXT NOT NULL DEFAULT 'You have a meeting',
  ADD COLUMN IF NOT EXISTS default_timer_mode TEXT NOT NULL DEFAULT 'open'
    CHECK (default_timer_mode IN ('open', 'call_focus', 'app_focus', 'strict'));
