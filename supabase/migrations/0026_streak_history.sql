-- SPEC § Streaks — extend user_profiles instead of creating a parallel
-- user_streaks table. user_profiles already has current_streak, longest_streak,
-- last_goal_met_date (migration 0012). The redesign needs one more field:
-- when the longest streak ended, for the "Best yet · Apr 7" subtitle on
-- the streak ring.
--
-- Idempotent.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS longest_streak_ended_at DATE;

-- Best-effort back-fill: if longest_streak == current_streak the user is on
-- their best run right now and longest_streak_ended_at stays NULL until they
-- break the streak. Otherwise we have no historical data, so it stays NULL —
-- the UI handles NULL by hiding the date suffix.
COMMENT ON COLUMN user_profiles.longest_streak_ended_at IS
  'Date the longest_streak run ended. NULL while the user is currently on their best streak, or when no historical data is available.';
