-- Weekly working-hours goal shown on the Timeline footer's pie card.
-- Week runs Sunday → Saturday in the user's local tz (the app computes the
-- window; this just stores the target hours).
alter table public.user_preferences
  add column if not exists weekly_work_goal_hours integer not null default 40;
