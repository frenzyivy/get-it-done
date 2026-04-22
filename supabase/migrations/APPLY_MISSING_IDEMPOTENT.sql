-- =============================================================================
-- One-shot idempotent catch-up script.
-- Safe to paste into the Supabase SQL editor on a partially-migrated database;
-- re-running it is a no-op.
--
-- Covers migrations 0015, 0018, 0019, 0020 — the set that is currently in the
-- repo but not applied to the live DB (as diagnosed from PGRST204/PGRST205
-- errors on tracked_sessions.planned_duration_seconds and public.categories).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0015_focus_mode.sql
-- =============================================================================
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

ALTER TABLE tracked_sessions
  ADD COLUMN IF NOT EXISTS drift_events JSONB NOT NULL DEFAULT '[]'::jsonb;

DROP INDEX IF EXISTS uniq_active_session_per_user;

CREATE INDEX IF NOT EXISTS idx_tracked_sessions_active
  ON tracked_sessions (user_id)
  WHERE ended_at IS NULL;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS allow_alarms BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS announce_focus_sessions BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS focus_announce_phrase TEXT NOT NULL DEFAULT 'You have a meeting',
  ADD COLUMN IF NOT EXISTS default_timer_mode TEXT NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_default_timer_mode_check'
  ) THEN
    ALTER TABLE user_preferences
      ADD CONSTRAINT user_preferences_default_timer_mode_check
      CHECK (default_timer_mode IN ('open', 'call_focus', 'app_focus', 'strict'));
  END IF;
END $$;

-- =============================================================================
-- 0018_focus_lock.sql
-- =============================================================================
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

CREATE OR REPLACE FUNCTION update_focus_streak() RETURNS TRIGGER AS $$
DECLARE
  session_date DATE;
  profile_row user_profiles%ROWTYPE;
  day_delta INT;
BEGIN
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
    RETURN NEW;
  END IF;

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
    RETURN NEW;
  ELSIF day_delta = 1 OR day_delta IS NULL THEN
    UPDATE user_profiles
      SET current_streak = COALESCE(current_streak, 0) + 1,
          longest_streak = GREATEST(COALESCE(longest_streak, 0), COALESCE(current_streak, 0) + 1),
          last_goal_met_date = session_date
      WHERE user_id = NEW.user_id;
  ELSE
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

-- =============================================================================
-- 0019_categories_projects.sql (idempotent)
-- =============================================================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own categories" ON categories;
CREATE POLICY "Users manage own categories" ON categories
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7c3aed',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own projects" ON projects;
CREATE POLICY "Users manage own projects" ON projects
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS task_categories (
  task_id     UUID NOT NULL REFERENCES tasks(id)      ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, category_id)
);

ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own task_categories" ON task_categories;
CREATE POLICY "Users manage own task_categories" ON task_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_categories.task_id AND tasks.user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS task_projects (
  task_id    UUID NOT NULL REFERENCES tasks(id)    ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, project_id)
);

ALTER TABLE task_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own task_projects" ON task_projects;
CREATE POLICY "Users manage own task_projects" ON task_projects
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_projects.task_id AND tasks.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_task_categories_task     ON task_categories(task_id);
CREATE INDEX IF NOT EXISTS idx_task_categories_category ON task_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_task_projects_task       ON task_projects(task_id);
CREATE INDEX IF NOT EXISTS idx_task_projects_project    ON task_projects(project_id);

-- =============================================================================
-- 0020_seed_categories_projects.sql
-- =============================================================================
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT id FROM public.profiles LOOP
    INSERT INTO public.categories (user_id, name, color, sort_order) VALUES
      (p.id, 'development', '#2563eb', 0),
      (p.id, 'content',     '#db2777', 1),
      (p.id, 'outreach',    '#ea580c', 2),
      (p.id, 'admin',       '#64748b', 3),
      (p.id, 'learning',    '#0891b2', 4),
      (p.id, 'personal',    '#16a34a', 5)
    ON CONFLICT (user_id, name) DO NOTHING;

    INSERT INTO public.projects (user_id, name, color, status, sort_order) VALUES
      (p.id, 'allianza-biz',      '#7c3aed', 'active', 0),
      (p.id, 'get-it-done',       '#0d9488', 'active', 1),
      (p.id, 'komalfi',           '#be123c', 'active', 2),
      (p.id, 'theaigirlhere',     '#9333ea', 'active', 3),
      (p.id, 'zakir',             '#2563eb', 'active', 4),
      (p.id, 'gre-prep',          '#ca8a04', 'active', 5),
      (p.id, 'perfume-brand',     '#e11d48', 'active', 6),
      (p.id, 'bags-line',         '#f97316', 'active', 7),
      (p.id, 'candles-business',  '#b45309', 'active', 8)
    ON CONFLICT (user_id, name) DO NOTHING;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
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
    (NEW.id, 'Outreach',  '#06b6d4', 5)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.categories (user_id, name, color, sort_order) VALUES
    (NEW.id, 'development', '#2563eb', 0),
    (NEW.id, 'content',     '#db2777', 1),
    (NEW.id, 'outreach',    '#ea580c', 2),
    (NEW.id, 'admin',       '#64748b', 3),
    (NEW.id, 'learning',    '#0891b2', 4),
    (NEW.id, 'personal',    '#16a34a', 5)
  ON CONFLICT (user_id, name) DO NOTHING;

  INSERT INTO public.projects (user_id, name, color, status, sort_order) VALUES
    (NEW.id, 'allianza-biz',      '#7c3aed', 'active', 0),
    (NEW.id, 'get-it-done',       '#0d9488', 'active', 1),
    (NEW.id, 'komalfi',           '#be123c', 'active', 2),
    (NEW.id, 'theaigirlhere',     '#9333ea', 'active', 3),
    (NEW.id, 'zakir',             '#2563eb', 'active', 4),
    (NEW.id, 'gre-prep',          '#ca8a04', 'active', 5),
    (NEW.id, 'perfume-brand',     '#e11d48', 'active', 6),
    (NEW.id, 'bags-line',         '#f97316', 'active', 7),
    (NEW.id, 'candles-business',  '#b45309', 'active', 8)
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;

-- After commit, force PostgREST to reload its schema cache so the new
-- columns/tables are visible to the REST API immediately. (Supabase
-- listens for NOTIFY pgrst.)
NOTIFY pgrst, 'reload schema';
