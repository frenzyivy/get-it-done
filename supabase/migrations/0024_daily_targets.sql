-- SPEC § Data model changes — daily_targets.
--
-- Per-weekday hour goals for the Calendar view's ring rendering. Replaces the
-- single weekly number in user_preferences.weekly_work_goal_hours (migration
-- 0017) for new code; old code keeps reading weekly_work_goal_hours until it's
-- migrated.
--
-- One row per user. Defaults match the SPEC's "Balanced" preset.

CREATE TABLE IF NOT EXISTS daily_targets (
  user_id     UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  mon         NUMERIC(4,1) NOT NULL DEFAULT 16 CHECK (mon BETWEEN 0 AND 24),
  tue         NUMERIC(4,1) NOT NULL DEFAULT 16 CHECK (tue BETWEEN 0 AND 24),
  wed         NUMERIC(4,1) NOT NULL DEFAULT 18 CHECK (wed BETWEEN 0 AND 24),
  thu         NUMERIC(4,1) NOT NULL DEFAULT 16 CHECK (thu BETWEEN 0 AND 24),
  fri         NUMERIC(4,1) NOT NULL DEFAULT 14 CHECK (fri BETWEEN 0 AND 24),
  sat         NUMERIC(4,1) NOT NULL DEFAULT 12 CHECK (sat BETWEEN 0 AND 24),
  sun         NUMERIC(4,1) NOT NULL DEFAULT  8 CHECK (sun BETWEEN 0 AND 24),
  preset_name TEXT
    CHECK (preset_name IS NULL OR preset_name IN ('balanced','weekend-off','hustle','custom')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE daily_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own daily_targets" ON daily_targets;
CREATE POLICY "Users manage own daily_targets" ON daily_targets
  FOR ALL USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_daily_targets_updated_at ON daily_targets;
CREATE TRIGGER set_daily_targets_updated_at
  BEFORE UPDATE ON daily_targets
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();
