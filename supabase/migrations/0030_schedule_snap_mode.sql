-- Feature 01 — Schedule Day view drag/resize snap mode.
-- 'hour'  → 60-min snapping (default, matches the user's hourly planning style)
-- '15min' → 15-min snapping
-- 'free'  → minute-precise (no snap)
alter table public.user_preferences
  add column if not exists schedule_snap_mode text not null default 'hour';

alter table public.user_preferences
  drop constraint if exists user_preferences_schedule_snap_mode_check;

alter table public.user_preferences
  add constraint user_preferences_schedule_snap_mode_check
  check (schedule_snap_mode in ('hour','15min','free'));
