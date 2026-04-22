-- Focus Lock (mobile 3-screen flow) — schema additions.
--
-- Spec mapping (UI label → existing tracked_sessions.mode):
--   Just Track  → 'open'
--   Focus       → 'app_focus'
--   No Mercy    → 'strict'
--
-- 1. broken / broken_reason — written when user exits a Strict session early.
--    duration_seconds is still recorded; the flag lets the streak trigger and
--    UI distinguish a completed session from an aborted one.
-- 2. planned_duration_seconds — the duration chip the user picked on Screen 1
--    (25m / 50m / 90m / free). Needed so Screen 2 can render "12m of 50m" and
--    the completion rule knows what "finished" means.
-- 3. Streak trigger — maintains user_profiles.current_streak, longest_streak,
--    last_goal_met_date. Fires on UPDATE of tracked_sessions when a row
--    transitions from active (ended_at IS NULL) to ended. A session counts
--    toward streak if it completed (not broken) and ran >= 15 minutes in a
--    focus-level mode (app_focus or strict). Consecutive days = streak++;
--    gap of >1 day = streak resets to 1; same day = no change.

-- =========================================================
-- tracked_sessions — broken flag + planned duration
-- =========================================================
ALTER TABLE tracked_sessions
  ADD COLUMN IF NOT EXISTS broken BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS broken_reason TEXT,
  ADD COLUMN IF NOT EXISTS planned_duration_seconds INTEGER;

COMMENT ON COLUMN tracked_sessions.broken IS
  'True when user exited a Strict-mode session before planned duration elapsed.';
COMMENT ON COLUMN tracked_sessions.broken_reason IS
  'Free-text reason captured on Screen 3 (Breaking Out). NULL for completed sessions.';
COMMENT ON COLUMN tracked_sessions.planned_duration_seconds IS
  'Duration chip picked on Screen 1. NULL for free-duration sessions.';

-- =========================================================
-- Streak trigger
-- =========================================================
-- Threshold: 15 min qualifies a focus-level session toward the streak.
-- Can be tuned later via a GUC or a user_profiles column without changing
-- the function signature.
CREATE OR REPLACE FUNCTION update_focus_streak() RETURNS TRIGGER AS $$
DECLARE
  session_date DATE;
  profile_row user_profiles%ROWTYPE;
  day_delta INT;
BEGIN
  -- Only react when a session transitions from active → ended.
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Qualifying session: focus-level mode, ≥15 min, not broken, not paused.
  IF NEW.mode NOT IN ('app_focus', 'strict') THEN RETURN NEW; END IF;
  IF COALESCE(NEW.duration_seconds, 0) < 900 THEN RETURN NEW; END IF;
  IF NEW.broken THEN RETURN NEW; END IF;
  IF NEW.was_paused THEN RETURN NEW; END IF;

  session_date := (NEW.ended_at AT TIME ZONE 'UTC')::DATE;

  SELECT * INTO profile_row FROM user_profiles WHERE user_id = NEW.user_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF profile_row.last_goal_met_date IS NULL THEN
    day_delta := NULL;
  ELSE
    day_delta := session_date - profile_row.last_goal_met_date;
  END IF;

  IF day_delta = 0 THEN
    -- Same day as last qualifying session — streak already counted.
    RETURN NEW;
  ELSIF day_delta = 1 OR day_delta IS NULL THEN
    -- Consecutive day OR first-ever qualifying session.
    UPDATE user_profiles
      SET current_streak = COALESCE(current_streak, 0) + 1,
          longest_streak = GREATEST(COALESCE(longest_streak, 0), COALESCE(current_streak, 0) + 1),
          last_goal_met_date = session_date
      WHERE user_id = NEW.user_id;
  ELSE
    -- Gap — reset to 1.
    UPDATE user_profiles
      SET current_streak = 1,
          longest_streak = GREATEST(COALESCE(longest_streak, 0), 1),
          last_goal_met_date = session_date
      WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_focus_streak ON tracked_sessions;
CREATE TRIGGER trg_focus_streak
  AFTER UPDATE ON tracked_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_focus_streak();

-- =========================================================
-- Streak reset on broken Strict session
-- =========================================================
-- Separate trigger so the rule is explicit and easy to change:
-- exiting a Strict session early zeros the streak immediately.
CREATE OR REPLACE FUNCTION reset_focus_streak_on_broken() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.broken = false AND NEW.broken = true AND NEW.mode = 'strict' THEN
    UPDATE user_profiles
      SET current_streak = 0
      WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_focus_streak_reset ON tracked_sessions;
CREATE TRIGGER trg_focus_streak_reset
  AFTER UPDATE OF broken ON tracked_sessions
  FOR EACH ROW
  EXECUTE FUNCTION reset_focus_streak_on_broken();
