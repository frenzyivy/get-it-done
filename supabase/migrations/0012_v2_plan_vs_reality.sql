-- v2 § 11 — Plan vs Reality schema
-- Adds the three tables the new Schedule + Timeline + momentum features need:
--   user_profiles    — daily goal, streak, work-day hours, pomodoro prefs
--   planned_blocks   — what the user intended (time blocks on the Schedule)
--   tracked_sessions — what actually happened (live timer, linked to a block if any)
--
-- Also adds tasks.estimated_seconds so task cards can show Est vs Actual.
--
-- Per spec §16 "Edge cases": only ONE tracked_sessions row per user may have
-- ended_at IS NULL at any time. Enforced with a partial unique index.

-- =========================================================
-- tasks.estimated_seconds
-- =========================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS estimated_seconds INTEGER;

-- =========================================================
-- user_profiles  (1:1 with auth.users; separate from our existing profiles
-- table which stores display_name. We keep them split so this migration is
-- additive and doesn't risk breaking Phase 2 code.)
-- =========================================================
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_task_goal INTEGER NOT NULL DEFAULT 3 CHECK (daily_task_goal > 0),
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_goal_met_date DATE,
  work_day_start TIME NOT NULL DEFAULT '09:00',
  work_day_end   TIME NOT NULL DEFAULT '18:00',
  pomodoro_work_minutes  INTEGER NOT NULL DEFAULT 25,
  pomodoro_break_minutes INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own user_profile" ON user_profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- =========================================================
-- planned_blocks
-- =========================================================
CREATE TABLE planned_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  subtask_id UUID REFERENCES subtasks(id) ON DELETE SET NULL,
  start_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  block_type TEXT NOT NULL DEFAULT 'work'
    CHECK (block_type IN ('work', 'break', 'lunch', 'meeting')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE planned_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own planned_blocks" ON planned_blocks
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_planned_blocks_user_day ON planned_blocks(user_id, start_at);

-- =========================================================
-- tracked_sessions
-- The existing `time_sessions` table (Phase 1) stays for backwards-compat but
-- v2's live timer writes here. The two can coexist; the v2 UI reads from
-- tracked_sessions exclusively.
-- =========================================================
CREATE TABLE tracked_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  subtask_id UUID REFERENCES subtasks(id) ON DELETE SET NULL,
  planned_block_id UUID REFERENCES planned_blocks(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  mode TEXT NOT NULL DEFAULT 'free'
    CHECK (mode IN ('free', 'pomodoro_25_5', 'pomodoro_50_10')),
  was_paused BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tracked_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tracked_sessions" ON tracked_sessions
  FOR ALL USING (auth.uid() = user_id);

-- "Only one active session per user" invariant. Partial unique index: rows
-- where ended_at IS NULL must be unique on user_id.
CREATE UNIQUE INDEX uniq_active_session_per_user
  ON tracked_sessions (user_id)
  WHERE ended_at IS NULL;

CREATE INDEX idx_tracked_sessions_user_day ON tracked_sessions(user_id, started_at);
CREATE INDEX idx_tracked_sessions_block    ON tracked_sessions(planned_block_id);

-- =========================================================
-- Views
-- =========================================================

-- Planned vs Actual per block (spec §11)
CREATE OR REPLACE VIEW v_planned_vs_actual AS
SELECT
  pb.id AS block_id,
  pb.user_id,
  pb.task_id,
  t.title AS task_title,
  pb.block_type,
  pb.start_at AS planned_start,
  pb.duration_seconds AS planned_seconds,
  COALESCE(SUM(ts.duration_seconds), 0)::int AS actual_seconds,
  COUNT(ts.id)::int AS session_count,
  CASE
    WHEN pb.start_at + (pb.duration_seconds * INTERVAL '1 second') > now()
         AND pb.start_at <= now()
         AND EXISTS (SELECT 1 FROM tracked_sessions s
                     WHERE s.planned_block_id = pb.id AND s.ended_at IS NULL) THEN 'tracking'
    WHEN COALESCE(SUM(ts.duration_seconds), 0) = 0 THEN 'skipped'
    WHEN COALESCE(SUM(ts.duration_seconds), 0)
         BETWEEN pb.duration_seconds * 0.9 AND pb.duration_seconds * 1.1 THEN 'on_time'
    WHEN COALESCE(SUM(ts.duration_seconds), 0) > pb.duration_seconds * 1.1 THEN 'over'
    ELSE 'under'
  END AS status
FROM planned_blocks pb
LEFT JOIN tasks t ON t.id = pb.task_id
LEFT JOIN tracked_sessions ts
  ON ts.planned_block_id = pb.id AND ts.ended_at IS NOT NULL
GROUP BY pb.id, t.title;

-- Unplanned sessions (tracked without a block)
CREATE OR REPLACE VIEW v_unplanned_sessions AS
SELECT
  ts.*,
  t.title AS task_title
FROM tracked_sessions ts
LEFT JOIN tasks t ON t.id = ts.task_id
WHERE ts.planned_block_id IS NULL
  AND ts.ended_at IS NOT NULL;

-- =========================================================
-- Seed user_profiles for existing users and extend signup trigger
-- =========================================================
INSERT INTO user_profiles (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.tags (user_id, name, color, sort_order) VALUES
    (NEW.id, 'AI Agency', '#8b5cf6', 0),
    (NEW.id, 'Content',   '#f59e0b', 1),
    (NEW.id, 'GRE',       '#10b981', 2),
    (NEW.id, 'KomalFi',   '#3b82f6', 3),
    (NEW.id, 'YouTube',   '#ef4444', 4),
    (NEW.id, 'Outreach',  '#06b6d4', 5);

  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.automation_rules (user_id, rule_key, is_enabled, config) VALUES
    (NEW.id, 'due_soon',             true,  '{"hours_before": 24}'::jsonb),
    (NEW.id, 'overdue',              true,  '{}'::jsonb),
    (NEW.id, 'overdue_escalate',     false, '{"bump_after_hours": 48}'::jsonb),
    (NEW.id, 'recurring',            true,  '{}'::jsonb),
    (NEW.id, 'stale_todo',           false, '{"days": 7}'::jsonb),
    (NEW.id, 'subtask_nudge',        false, '{"days": 3}'::jsonb),
    (NEW.id, 'completion_celebrate', true,  '{}'::jsonb);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
