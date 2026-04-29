-- ============================================================================
-- Get-it-done — full schema bundle for a throwaway Supabase project
-- ============================================================================
-- Generated for verifying Phase 1, step 1 of the redesign SPEC. Concatenates
-- migrations 0001–0010 and 0012–0026 in order. Migration 0011 (pg_cron
-- schedules) is intentionally skipped: it requires project-ref placeholders
-- and Edge Function deploys, which aren't relevant to a schema-only check.
--
-- USAGE
-- -----
-- 1. Create a fresh Supabase project (Dashboard → New Project, free tier).
-- 2. SQL Editor → New query → paste this entire file → Run.
-- 3. Then paste-and-run supabase/tests/verify_phase1_step1.sql to confirm
--    the new shape from migrations 0021–0026 landed correctly.
-- 4. Delete the throwaway project when done.
--
-- This file is GENERATED. Do not edit; regenerate via:
--   bash supabase/tests/build_full_bundle.sh
-- ============================================================================

-- ============================================================================
-- 0001_profiles.sql
-- ============================================================================
-- PLAN.md § 2.1 — profiles
-- 1:1 with auth.users. Deleting the auth user cascades here.

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own profile" ON profiles;
CREATE POLICY "Users manage own profile" ON profiles
  FOR ALL USING (auth.uid() = id);

-- ============================================================================
-- 0002_tags.sql
-- ============================================================================
-- PLAN.md § 2.2 — tags (user-scoped)

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#8b5cf6',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own tags" ON tags;
CREATE POLICY "Users manage own tags" ON tags
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 0003_tasks.sql
-- ============================================================================
-- PLAN.md § 2.3 — tasks

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date DATE,
  total_time_seconds INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own tasks" ON tasks;
CREATE POLICY "Users manage own tasks" ON tasks
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(user_id, priority);

-- ============================================================================
-- 0004_task_tags.sql
-- ============================================================================
-- PLAN.md § 2.4 — task_tags (junction: tasks ↔ tags)

CREATE TABLE IF NOT EXISTS task_tags (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own task_tags" ON task_tags;
CREATE POLICY "Users manage own task_tags" ON task_tags
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = auth.uid())
  );

-- ============================================================================
-- 0005_subtasks.sql
-- ============================================================================
-- PLAN.md § 2.5 — subtasks

CREATE TABLE IF NOT EXISTS subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done BOOLEAN DEFAULT false,
  total_time_seconds INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own subtasks" ON subtasks;
CREATE POLICY "Users manage own subtasks" ON subtasks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = subtasks.task_id AND tasks.user_id = auth.uid())
  );

-- ============================================================================
-- 0006_time_sessions.sql
-- ============================================================================
-- PLAN.md § 2.6 — time_sessions
-- `label` is a snapshot of the subtask title at log time so it survives renames/deletes.

CREATE TABLE IF NOT EXISTS time_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  subtask_id UUID REFERENCES subtasks(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE time_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own sessions" ON time_sessions;
CREATE POLICY "Users manage own sessions" ON time_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = time_sessions.task_id AND tasks.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_sessions_task    ON time_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_sessions_subtask ON time_sessions(subtask_id);

-- ============================================================================
-- 0007_updated_at_trigger.sql
-- ============================================================================
-- PLAN.md § 2.7 — auto-update tasks.updated_at on row update

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tasks_updated_at ON tasks;
CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ============================================================================
-- 0008_save_time_session_rpc.sql
-- ============================================================================
-- PLAN.md § 2.8 — save_time_session RPC
-- Atomic write across 3 tables: time_sessions (insert), tasks (increment total),
-- subtasks (increment total if subtask_id provided).
-- Called from the client via supabase.rpc('save_time_session', { ... }).

CREATE OR REPLACE FUNCTION save_time_session(
  p_task_id    UUID,
  p_subtask_id UUID,
  p_started_at TIMESTAMPTZ,
  p_duration   INTEGER,
  p_label      TEXT
) RETURNS void AS $$
BEGIN
  INSERT INTO time_sessions (task_id, subtask_id, started_at, duration_seconds, label)
  VALUES (p_task_id, p_subtask_id, p_started_at, p_duration, p_label);

  UPDATE tasks SET total_time_seconds = total_time_seconds + p_duration
  WHERE id = p_task_id;

  IF p_subtask_id IS NOT NULL THEN
    UPDATE subtasks SET total_time_seconds = total_time_seconds + p_duration
    WHERE id = p_subtask_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 0009_new_user_trigger.sql
-- ============================================================================
-- PLAN.md § 3 — On first sign-up, create profile row + seed default tags.
-- Implemented as a trigger on auth.users so it runs atomically regardless of
-- signup path (email/password or Google OAuth). Seed list is PLAN.md § 2.2.

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
    (NEW.id, 'Outreach',  '#06b6d4', 5);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth signup on seeding failure. Error goes to Postgres logs.
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- 0010_automations_schema.sql
-- ============================================================================
-- Phase 5 — Automations schema
-- Adds the tables Edge Functions read/write:
--   user_preferences  — per-user toggles for AI, notifications, email schedule
--   automation_rules  — built-in rules the user can enable/disable
--   recurring_templates — blueprints that materialize into tasks on a schedule
--   notifications     — outbox of user-facing messages (in-app realtime + push + email)
--
-- Plus a `recurring_template_id` on tasks so we can trace materialized instances
-- back to their template (needed for "don't modify the template" invariant).

-- =========================================================
-- user_preferences (1:1 with profiles)
-- =========================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'UTC',

  -- AI toggles (Phase 4)
  ai_auto_subtasks BOOLEAN NOT NULL DEFAULT false,
  ai_auto_tags     BOOLEAN NOT NULL DEFAULT false,
  ai_auto_priority BOOLEAN NOT NULL DEFAULT false,

  -- Notification channels
  notify_in_app BOOLEAN NOT NULL DEFAULT true,
  notify_push   BOOLEAN NOT NULL DEFAULT true,
  notify_email  BOOLEAN NOT NULL DEFAULT false,
  expo_push_token TEXT,

  -- Daily summary config (Phase 7)
  daily_summary_enabled BOOLEAN NOT NULL DEFAULT false,
  daily_summary_hour    INTEGER NOT NULL DEFAULT 8 CHECK (daily_summary_hour BETWEEN 0 AND 23),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own preferences" ON user_preferences;
CREATE POLICY "Users manage own preferences" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER set_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- =========================================================
-- automation_rules (built-in rules, one row per user per rule)
-- =========================================================
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,               -- e.g. 'due_soon', 'overdue_escalate'
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,  -- rule-specific params (e.g. { "hours_before": 24 })
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, rule_key)
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own automation_rules" ON automation_rules;
CREATE POLICY "Users manage own automation_rules" ON automation_rules
  FOR ALL USING (auth.uid() = user_id);

-- =========================================================
-- recurring_templates (blueprints)
-- =========================================================
CREATE TABLE IF NOT EXISTS recurring_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  tag_ids UUID[] NOT NULL DEFAULT '{}',
  subtask_titles TEXT[] NOT NULL DEFAULT '{}',
  -- Cron-style schedule: 'daily' | 'weekly' | 'monthly' | custom cron
  frequency TEXT NOT NULL
    CHECK (frequency IN ('daily', 'weekdays', 'weekly', 'monthly')),
  -- For weekly: 0-6 (Sun-Sat). For monthly: 1-31.
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
  -- Local-time hour the task should appear (user's timezone from user_preferences)
  hour_local INTEGER NOT NULL DEFAULT 8 CHECK (hour_local BETWEEN 0 AND 23),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_materialized_at TIMESTAMPTZ,     -- idempotency: only create once per cycle
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own recurring_templates" ON recurring_templates;
CREATE POLICY "Users manage own recurring_templates" ON recurring_templates
  FOR ALL USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_recurring_templates_updated_at ON recurring_templates;
CREATE TRIGGER set_recurring_templates_updated_at
  BEFORE UPDATE ON recurring_templates
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE INDEX IF NOT EXISTS idx_recurring_templates_user ON recurring_templates(user_id, is_enabled);

-- Trace materialized tasks back to their template
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_template_id UUID
  REFERENCES recurring_templates(id) ON DELETE SET NULL;

-- =========================================================
-- notifications (outbox — in-app via Realtime, push via Expo, email via Resend)
-- =========================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                   -- 'due_soon', 'overdue', 'daily_summary', 'recurring_created', ...
  title TEXT NOT NULL,
  body TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { task_id, deep_link, ... }
  read_at TIMESTAMPTZ,
  push_sent_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own notifications" ON notifications;
CREATE POLICY "Users read own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);
-- INSERT is reserved for service-role (Edge Functions); no policy = denied to auth.uid().

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_unsent_push  ON notifications(user_id) WHERE push_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_unsent_email ON notifications(user_id) WHERE email_sent_at IS NULL;

-- Realtime subscription works out of the box because the notifications table
-- is in the public schema with RLS — clients subscribing filter by user_id.

-- =========================================================
-- Seed default automation rules on user signup
-- Also create user_preferences row.
-- =========================================================
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

  -- Seed the 7 built-in automation rules (all enabled by default except overdue escalation)
  INSERT INTO public.automation_rules (user_id, rule_key, is_enabled, config) VALUES
    (NEW.id, 'due_soon',           true,  '{"hours_before": 24}'::jsonb),
    (NEW.id, 'overdue',            true,  '{}'::jsonb),
    (NEW.id, 'overdue_escalate',   false, '{"bump_after_hours": 48}'::jsonb),
    (NEW.id, 'recurring',          true,  '{}'::jsonb),
    (NEW.id, 'stale_todo',         false, '{"days": 7}'::jsonb),
    (NEW.id, 'subtask_nudge',      false, '{"days": 3}'::jsonb),
    (NEW.id, 'completion_celebrate', true, '{}'::jsonb);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 0012_v2_plan_vs_reality.sql
-- ============================================================================
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
CREATE TABLE IF NOT EXISTS user_profiles (
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
DROP POLICY IF EXISTS "Users manage own user_profile" ON user_profiles;
CREATE POLICY "Users manage own user_profile" ON user_profiles
  FOR ALL USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER set_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- =========================================================
-- planned_blocks
-- =========================================================
CREATE TABLE IF NOT EXISTS planned_blocks (
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
DROP POLICY IF EXISTS "Users manage own planned_blocks" ON planned_blocks;
CREATE POLICY "Users manage own planned_blocks" ON planned_blocks
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_planned_blocks_user_day ON planned_blocks(user_id, start_at);

-- =========================================================
-- tracked_sessions
-- The existing `time_sessions` table (Phase 1) stays for backwards-compat but
-- v2's live timer writes here. The two can coexist; the v2 UI reads from
-- tracked_sessions exclusively.
-- =========================================================
CREATE TABLE IF NOT EXISTS tracked_sessions (
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
DROP POLICY IF EXISTS "Users manage own tracked_sessions" ON tracked_sessions;
CREATE POLICY "Users manage own tracked_sessions" ON tracked_sessions
  FOR ALL USING (auth.uid() = user_id);

-- "Only one active session per user" invariant. Partial unique index: rows
-- where ended_at IS NULL must be unique on user_id.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_session_per_user
  ON tracked_sessions (user_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tracked_sessions_user_day ON tracked_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_tracked_sessions_block    ON tracked_sessions(planned_block_id);

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

-- ============================================================================
-- 0013_ai_logs.sql
-- ============================================================================
-- PLAN.md § 2 — ai_logs: every Claude API call is logged with token counts
-- so we can monitor cost and debug prompts. See get-it-done-web/lib/anthropic.ts
-- (runAgent) for the call sites that INSERT into this table.
--
-- NOTE: this file was lost from the repo locally and has been reconstructed
-- from the runAgent() insert shape. The column set below is derived — if the
-- production schema diverges, reconcile before running on a fresh database.

CREATE TABLE IF NOT EXISTS ai_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own logs (useful for a per-user cost page later).
DROP POLICY IF EXISTS "Users read own ai_logs" ON ai_logs;
CREATE POLICY "Users read own ai_logs" ON ai_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role writes. No INSERT policy for authenticated users — the
-- runAgent helper uses supabaseAdmin() and bypasses RLS on INSERT.

CREATE INDEX IF NOT EXISTS idx_ai_logs_user_created
  ON ai_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_agent
  ON ai_logs (agent);

-- ============================================================================
-- 0014_task_description.sql
-- ============================================================================
-- Feature 3 (edit drawer) — adds an optional long-form description to tasks.
-- Nullable; existing rows are unaffected.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================================================
-- 0015_focus_mode.sql
-- ============================================================================
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

-- ============================================================================
-- 0016_today_five.sql
-- ============================================================================
-- New-spec-1 § Feature 6 — Today's 5
--
-- Adds a per-task `planned_for_date` so the dashboard can surface up to 5
-- tasks a user plans to tackle on a given day. The DailyGoalBar filters
-- tasks by `planned_for_date === today()` and sorts by `sort_order`.
--
-- NOTE: this file was lost locally and has been reconstructed from the code
-- that depends on it. The prod database already had this migration applied
-- (otherwise the Today's 5 UI wouldn't read/write the column successfully).
-- If the production schema has additional indexes or constraints, reconcile
-- before running on a fresh database.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS planned_for_date DATE;

-- The dashboard filters by this column every render; index for speed.
CREATE INDEX IF NOT EXISTS idx_tasks_planned_for_date
  ON tasks (user_id, planned_for_date)
  WHERE planned_for_date IS NOT NULL;

-- ============================================================================
-- 0017_weekly_work_goal.sql
-- ============================================================================
-- Weekly working-hours goal shown on the Timeline footer's pie card.
-- Week runs Sunday → Saturday in the user's local tz (the app computes the
-- window; this just stores the target hours).
alter table public.user_preferences
  add column if not exists weekly_work_goal_hours integer not null default 40;

-- ============================================================================
-- 0018_focus_lock.sql
-- ============================================================================
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

-- ============================================================================
-- 0019_categories_projects.sql
-- ============================================================================
-- Categories + Projects — two new user-scoped label dimensions alongside tags.
-- Mirrors the shape of tags/task_tags (0002 + 0004). RLS identical to tags:
-- owner-scoped for the label tables, join rows gated by task ownership.
--
-- Visual & analytics weight: category > project > tag.

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

-- ============================================================================
-- 0020_seed_categories_projects.sql
-- ============================================================================
-- Seed default categories + projects. Idempotent: the ON CONFLICT clauses rely
-- on the (user_id, name) unique indexes from migration 0019 so running the
-- backfill block twice produces no duplicates.
--
-- Also rewrites handle_new_user() so future signups get the same seeds.

-- 1. Backfill for every existing profile.
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

-- 2. Update the new-user trigger so future signups get the same seeds plus
--    the existing tag defaults. Keeps the original EXCEPTION handler so auth
--    signup never blocks on seeding failure.
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

-- ============================================================================
-- 0021_project_lifecycle.sql
-- ============================================================================
-- SPEC § Data model changes — project lifecycle.
--
-- Migration 0019 created `projects` with status check ('active','paused','archived').
-- The redesign needs a 'completed' state (kept-but-hidden, distinct from 'archived'
-- which is hidden everywhere). Plus three columns the List-view squares and
-- audit-trail rely on: completed_at, archived_at, description.
--
-- Idempotent: safe to re-run after partial application.

-- 1. Add the new columns first so the back-fill below can populate them.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS description  TEXT;

-- 2. Widen the status check. Drop the old constraint, add the new one.
--    'paused' stays valid so existing rows from 0019 don't fail the check.
--    The UI treats 'paused' as a legacy synonym for 'active'.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'archived'));

-- 3. Index for the manage-projects-by-status filter and dropdown queries.
CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects (user_id, status);

-- 4. Back-fill timestamps for any rows that were already in a terminal state
--    when this migration runs. Uses created_at as a "best guess" stamp; this
--    only matters for analytics, not behavior.
UPDATE projects
   SET archived_at = COALESCE(archived_at, created_at)
 WHERE status = 'archived' AND archived_at IS NULL;

-- ============================================================================
-- 0022_task_completed_at.sql
-- ============================================================================
-- SPEC § Data model changes — tasks.completed_at.
--
-- Done is manual: a checkbox stamps completed_at = now(). The legacy
-- tasks.status column (migration 0003) stays writable for now so existing code
-- doesn't break; new code reads v_task_status (migration 0023) which treats
-- completed_at IS NOT NULL as the only signal for 'done'.
--
-- Idempotent.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Back-fill: any task already in status='done' gets completed_at = updated_at
-- (best-available stamp; the trigger from 0007 keeps updated_at fresh).
UPDATE tasks
   SET completed_at = updated_at
 WHERE status = 'done' AND completed_at IS NULL;

-- Partial index so the Done tab and analytics queries stay fast as the table grows.
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
  ON tasks (user_id, completed_at)
  WHERE completed_at IS NOT NULL;

-- ============================================================================
-- 0023_v_task_status.sql
-- ============================================================================
-- SPEC § Data model changes — derived task status.
--
-- effective_status is computed, not stored:
--   * tasks.completed_at IS NOT NULL                                  -> 'done'
--   * any tracked_sessions row on task or its subtasks has duration   -> 'in_progress'
--   * any tracked_sessions row on task or its subtasks is open        -> 'in_progress'
--   * else                                                            -> 'todo'
--
-- The legacy tasks.status column from 0003 is intentionally ignored. New
-- queries should JOIN v_task_status; tasks.status will be retired in a later
-- migration once all callers are migrated.
--
-- Reads tracked_sessions (migration 0012), not the older time_sessions table.
-- Idempotent via CREATE OR REPLACE.

CREATE OR REPLACE VIEW v_task_status AS
SELECT
  t.id,
  t.user_id,
  CASE
    WHEN t.completed_at IS NOT NULL THEN 'done'
    WHEN EXISTS (
      SELECT 1 FROM tracked_sessions ts
       WHERE ts.task_id = t.id
         AND COALESCE(ts.duration_seconds, 0) > 0
    )
      OR EXISTS (
      SELECT 1 FROM tracked_sessions ts
        JOIN subtasks st ON st.id = ts.subtask_id
       WHERE st.task_id = t.id
         AND COALESCE(ts.duration_seconds, 0) > 0
    )
      OR EXISTS (
      -- An open (still-running) session also promotes to in_progress
      SELECT 1 FROM tracked_sessions ts
       WHERE ts.ended_at IS NULL
         AND (
           ts.task_id = t.id
           OR ts.subtask_id IN (SELECT id FROM subtasks WHERE task_id = t.id)
         )
    ) THEN 'in_progress'
    ELSE 'todo'
  END AS effective_status
FROM tasks t;

-- RLS on the view is inherited from the underlying tables (tasks, subtasks,
-- tracked_sessions all enforce auth.uid() = user_id), so no extra policy needed.
COMMENT ON VIEW v_task_status IS
  'Per-task derived status: done | in_progress | todo. Computed from completed_at and tracked_sessions. JOIN this view; do not read tasks.status directly.';

-- ============================================================================
-- 0024_daily_targets.sql
-- ============================================================================
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

-- ============================================================================
-- 0025_saved_views.sql
-- ============================================================================
-- SPEC § Data model changes — saved_views.
--
-- A user-named filter combination per view type. Lets Komal jump back to
-- "Get-it-done · Dev" or "Allianza · Outreach" without rebuilding chips
-- every time. The Quick-add bar reads the active view's filters for sticky
-- inheritance.

CREATE TABLE IF NOT EXISTS saved_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  view_type   TEXT NOT NULL
    CHECK (view_type IN ('board','list','priority','calendar')),
  -- example: {"projects": ["uuid1","uuid2"], "categories": ["uuid3"], "tags": ["#deep-work"]}
  filters     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name, view_type)
);

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own saved_views" ON saved_views;
CREATE POLICY "Users manage own saved_views" ON saved_views
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_views_user
  ON saved_views (user_id, view_type);

DROP TRIGGER IF EXISTS set_saved_views_updated_at ON saved_views;
CREATE TRIGGER set_saved_views_updated_at
  BEFORE UPDATE ON saved_views
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ============================================================================
-- 0026_streak_history.sql
-- ============================================================================
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
