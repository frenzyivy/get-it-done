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
CREATE TABLE user_preferences (
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
CREATE POLICY "Users manage own preferences" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- =========================================================
-- automation_rules (built-in rules, one row per user per rule)
-- =========================================================
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,               -- e.g. 'due_soon', 'overdue_escalate'
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,  -- rule-specific params (e.g. { "hours_before": 24 })
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, rule_key)
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own automation_rules" ON automation_rules
  FOR ALL USING (auth.uid() = user_id);

-- =========================================================
-- recurring_templates (blueprints)
-- =========================================================
CREATE TABLE recurring_templates (
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
CREATE POLICY "Users manage own recurring_templates" ON recurring_templates
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_recurring_templates_updated_at
  BEFORE UPDATE ON recurring_templates
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE INDEX idx_recurring_templates_user ON recurring_templates(user_id, is_enabled);

-- Trace materialized tasks back to their template
ALTER TABLE tasks ADD COLUMN recurring_template_id UUID
  REFERENCES recurring_templates(id) ON DELETE SET NULL;

-- =========================================================
-- notifications (outbox — in-app via Realtime, push via Expo, email via Resend)
-- =========================================================
CREATE TABLE notifications (
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
CREATE POLICY "Users read own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);
-- INSERT is reserved for service-role (Edge Functions); no policy = denied to auth.uid().

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX idx_notifications_unsent_push  ON notifications(user_id) WHERE push_sent_at IS NULL;
CREATE INDEX idx_notifications_unsent_email ON notifications(user_id) WHERE email_sent_at IS NULL;

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
