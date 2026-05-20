-- Phase 8 — Sticky timer toggles
--
-- Two new prefs on user_preferences. Presence detection prefs already exist
-- on user_preferences from migration 0033, so Phase 9 is type/UI-only.
--
-- Idempotent.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS sticky_timer_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sticky_timer_position TEXT NOT NULL DEFAULT 'bottom_right';

ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_sticky_timer_position_check;
ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_sticky_timer_position_check
  CHECK (sticky_timer_position IN ('bottom_right','bottom_left','top_right','top_left'));
