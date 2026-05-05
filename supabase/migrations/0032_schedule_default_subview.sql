-- Feature 09 — Schedule sub-tabs (Day / Week / Month).
-- Stores the user's preferred default sub-tab so it persists across devices.
-- Note: feature spec referenced 'user_settings' but this codebase uses 'user_preferences'.
alter table public.user_preferences
  add column if not exists schedule_default_subview text not null default 'day';

alter table public.user_preferences
  drop constraint if exists user_preferences_schedule_default_subview_check;

alter table public.user_preferences
  add constraint user_preferences_schedule_default_subview_check
  check (schedule_default_subview in ('day','week','month'));
