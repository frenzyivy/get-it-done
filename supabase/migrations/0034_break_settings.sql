-- Phase 5 — Break blocks (unrecorded gap detection)
--
-- Two new toggles on user_preferences:
--   show_break_blocks         BOOLEAN  default TRUE
--     Hide/show the striped lavender gap blocks on Timeline and Schedule.
--   break_min_gap_minutes     INTEGER  default 5 (1..30)
--     Gaps shorter than this are ignored entirely (transition time).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, drop-and-recreate the CHECK constraint.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS show_break_blocks BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS break_min_gap_minutes INTEGER NOT NULL DEFAULT 5;

ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_break_min_gap_check;
ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_break_min_gap_check
  CHECK (break_min_gap_minutes BETWEEN 1 AND 30);
