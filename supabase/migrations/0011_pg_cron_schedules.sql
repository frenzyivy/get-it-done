-- Phase 5 — pg_cron schedules that invoke Edge Functions on a timer.
-- Supabase has pg_cron + pg_net ("http" extension) available. Cron calls
-- the Edge Function URL with the service-role key so the function can use
-- the admin client.
--
-- BEFORE RUNNING THIS MIGRATION:
--   1. Deploy the Edge Functions first:
--        supabase functions deploy create-recurring-tasks
--        supabase functions deploy check-due-dates
--        supabase functions deploy escalate-overdue
--        supabase functions deploy send-notifications
--        supabase functions deploy daily-summary
--   2. Set the two placeholders below to your project values:
--        :project_ref        (e.g. fupyweggwzctfbouudbi)
--        :service_role_key   (Dashboard \u2192 Settings \u2192 API \u2192 service_role \u2014 NOT the anon key)
--   3. Run this file.
--
-- Idempotent: every job is re-created cleanly.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Stash the project config in app settings so future cron tweaks don't
-- require editing every job. Replace the two values below before running.
ALTER DATABASE postgres SET app.project_ref        = 'fupyweggwzctfbouudbi';
ALTER DATABASE postgres SET app.service_role_key   = 'REPLACE_WITH_SERVICE_ROLE_KEY';

-- Helper: build the Edge Function URL + Authorization header on the fly.
CREATE OR REPLACE FUNCTION invoke_edge(fn_name TEXT)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req_id bigint;
  url    TEXT;
  key    TEXT;
BEGIN
  url := format('https://%s.supabase.co/functions/v1/%s',
                current_setting('app.project_ref', true),
                fn_name);
  key := current_setting('app.service_role_key', true);

  SELECT net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || key
    ),
    body := '{}'::jsonb
  ) INTO req_id;

  RETURN req_id;
END;
$$;

-- Remove any previously-scheduled copies so this migration is safe to re-run.
SELECT cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN (
    'create-recurring-tasks',
    'check-due-dates',
    'escalate-overdue',
    'send-notifications',
    'daily-summary'
  );

-- =========================================================
-- Every 15 min: materialize due recurring templates
-- =========================================================
SELECT cron.schedule(
  'create-recurring-tasks',
  '*/15 * * * *',
  $$SELECT invoke_edge('create-recurring-tasks');$$
);

-- =========================================================
-- Hourly: due-soon + overdue reminders
-- =========================================================
SELECT cron.schedule(
  'check-due-dates',
  '0 * * * *',
  $$SELECT invoke_edge('check-due-dates');$$
);

-- =========================================================
-- Every 6h: escalate priority on long-overdue tasks
-- =========================================================
SELECT cron.schedule(
  'escalate-overdue',
  '0 */6 * * *',
  $$SELECT invoke_edge('escalate-overdue');$$
);

-- =========================================================
-- Every 2 min: drain notifications outbox (push + email)
-- =========================================================
SELECT cron.schedule(
  'send-notifications',
  '*/2 * * * *',
  $$SELECT invoke_edge('send-notifications');$$
);

-- =========================================================
-- Hourly: daily summary (function itself filters by user's local hour)
-- =========================================================
SELECT cron.schedule(
  'daily-summary',
  '0 * * * *',
  $$SELECT invoke_edge('daily-summary');$$
);
