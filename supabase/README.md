# Supabase Setup

## 1. Create the project
1. Go to https://supabase.com → **New Project**
2. Name: `get-it-done` · region closest to you · save DB password
3. Wait for provisioning (~2 min)

## 2. Run the migrations (Phases 1 & 5)

Dashboard → **SQL Editor** → **New query**. Paste and run each file in numeric order:

| # | File | Phase | What it does |
|---|------|-------|--------------|
| 1 | [migrations/0001_profiles.sql](migrations/0001_profiles.sql) | 1 | `profiles` table + RLS |
| 2 | [migrations/0002_tags.sql](migrations/0002_tags.sql) | 1 | `tags` table + RLS |
| 3 | [migrations/0003_tasks.sql](migrations/0003_tasks.sql) | 1 | `tasks` table + RLS + indexes |
| 4 | [migrations/0004_task_tags.sql](migrations/0004_task_tags.sql) | 1 | `task_tags` junction + RLS |
| 5 | [migrations/0005_subtasks.sql](migrations/0005_subtasks.sql) | 1 | `subtasks` table + RLS |
| 6 | [migrations/0006_time_sessions.sql](migrations/0006_time_sessions.sql) | 1 | `time_sessions` table + RLS + indexes |
| 7 | [migrations/0007_updated_at_trigger.sql](migrations/0007_updated_at_trigger.sql) | 1 | `tasks.updated_at` auto-bump trigger |
| 8 | [migrations/0008_save_time_session_rpc.sql](migrations/0008_save_time_session_rpc.sql) | 1 | `save_time_session` RPC (atomic 3-table write) |
| 9 | [migrations/0009_new_user_trigger.sql](migrations/0009_new_user_trigger.sql) | 1 | On signup → insert `profiles` row + seed 6 default tags |
| 10 | [migrations/0010_automations_schema.sql](migrations/0010_automations_schema.sql) | 5 | `user_preferences`, `automation_rules`, `recurring_templates`, `notifications` + re-seed trigger |
| 11 | [migrations/0011_pg_cron_schedules.sql](migrations/0011_pg_cron_schedules.sql) | 5 | pg_cron jobs that invoke Edge Functions (see Phase 5 below — requires service-role key) |

Order matters because of foreign keys. Each file ends with `Success. No rows returned.`

## 3. Enable Google OAuth
1. Dashboard → **Authentication → Providers → Google** → Enable
2. In Google Cloud Console: create OAuth 2.0 client (Web application)
3. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Paste Client ID + Secret into Supabase, Save
5. Also enable **Email** provider (email + password signups)

## 4. Grab the connection strings
**Project Settings → API**, copy for the clients:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# For mobile use EXPO_PUBLIC_ instead of NEXT_PUBLIC_
```

---

# Phase 5 — Edge Functions + Automations

Five Deno Edge Functions under [functions/](functions/) drive all automations:

| Function | Cron | What it does |
|---|---|---|
| [create-recurring-tasks](functions/create-recurring-tasks/index.ts) | every 15 min | Materializes due `recurring_templates` into new tasks. Never mutates the template — just updates `last_materialized_at` for idempotency. |
| [check-due-dates](functions/check-due-dates/index.ts) | hourly | Scans non-done tasks with `due_date`. Queues `due_soon` (within `hours_before` window) + `overdue` notifications. Fires once per task per kind. |
| [escalate-overdue](functions/escalate-overdue/index.ts) | every 6h | Bumps priority (low → medium → high → urgent) on tasks overdue > `bump_after_hours`. Only priority changes. |
| [send-notifications](functions/send-notifications/index.ts) | every 2 min | Drains unsent rows from the `notifications` outbox, fans out to Expo Push + Resend email, stamps `push_sent_at` / `email_sent_at`. In-app is handled by Supabase Realtime automatically. |
| [daily-summary](functions/daily-summary/index.ts) | hourly | For users whose local hour matches `daily_summary_hour`, calls Claude (Haiku 4.5) to produce a morning briefing and inserts one notification per user per local day. |

## Deploy the functions

One-time setup:
```bash
# Install the Supabase CLI (winget on Windows, brew on macOS, script on Linux):
winget install Supabase.CLI   # Windows
# brew install supabase/tap/supabase   # macOS

supabase login
supabase link --project-ref fupyweggwzctfbouudbi
```

Set the runtime secrets the functions need:
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RESEND_FROM="Get-it-done <notifications@yourdomain.com>"
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
```

Deploy all five at once:
```bash
cd supabase && deno task --config functions/deno.json deploy:all
# Or one at a time:
supabase functions deploy create-recurring-tasks
supabase functions deploy check-due-dates
supabase functions deploy escalate-overdue
supabase functions deploy send-notifications
supabase functions deploy daily-summary
```

## Wire up cron

Migration **0011** schedules all five jobs via `pg_cron` + `pg_net`. **Before you run it:**

1. Get the **service_role key** from Dashboard → Settings → API → `service_role` (NOT the anon key).
2. Open [migrations/0011_pg_cron_schedules.sql](migrations/0011_pg_cron_schedules.sql) in an editor.
3. Replace `REPLACE_WITH_SERVICE_ROLE_KEY` with the actual key. Leave `project_ref` alone if your ref is `fupyweggwzctfbouudbi`; otherwise change it too.
4. Run the file in the SQL Editor.

## Verify
```sql
-- Confirm the five jobs were scheduled
SELECT jobname, schedule, active FROM cron.job;

-- Trigger one by hand (it runs in the background via pg_net)
SELECT invoke_edge('check-due-dates');

-- Peek at queued notifications
SELECT kind, title, created_at, push_sent_at IS NOT NULL AS pushed
FROM notifications ORDER BY created_at DESC LIMIT 10;
```

## Per-user config

The client app writes to these tables to control behavior:

- **user_preferences** — timezone, per-channel toggles (`notify_push`, `notify_email`, `notify_in_app`), `expo_push_token`, daily summary time
- **automation_rules** — seeded on signup with sensible defaults; users can disable any rule (`due_soon`, `overdue`, `overdue_escalate`, `recurring`, etc.)
- **recurring_templates** — user-created blueprints. Set `is_enabled = false` to pause without deleting.

Realtime: have the client subscribe to `notifications` filtered by `user_id` for the in-app bell/dropdown. No polling needed.
