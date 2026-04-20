export type Status = 'todo' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface SubtaskType {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  total_time_seconds: number;
  sort_order: number;
}

export interface TimeSession {
  id: string;
  task_id: string;
  subtask_id: string | null;
  started_at: string;
  duration_seconds: number;
  label: string | null;
}

export interface TaskType {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  due_date: string | null;
  total_time_seconds: number;
  estimated_seconds: number | null;
  sort_order: number;
  allow_alarms: boolean;
  // "Today's 5" planning date — the date the user intends to work on this
  // task. Distinct from `due_date` which is the external deadline.
  planned_for_date: string | null;
  tag_ids: string[];
  subtasks: SubtaskType[];
  sessions: TimeSession[];
}

export interface TagType {
  id: string;
  name: string;
  color: string;
}

export type ViewMode = 'list' | 'kanban' | 'schedule' | 'timeline';

export interface NotificationType {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface UserPrefs {
  user_id: string;
  timezone: string;
  ai_auto_subtasks: boolean;
  ai_auto_tags: boolean;
  ai_auto_priority: boolean;
  notify_in_app: boolean;
  notify_push: boolean;
  notify_email: boolean;
  expo_push_token: string | null;
  daily_summary_enabled: boolean;
  daily_summary_hour: number;
  // New-spec-1 Feature 5 — focus session settings
  announce_focus_sessions: boolean;
  focus_announce_phrase: string;
  default_timer_mode: FocusMode;
  // Weekly work-hours goal used by the Timeline footer's Goal pie card.
  // Week is Sun → Sat in local time; goal is the target for the whole week.
  weekly_work_goal_hours: number;
}

export interface AutomationRule {
  id: string;
  user_id: string;
  rule_key: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
}

// v2 — Plan vs Reality
export interface UserProfileV2 {
  user_id: string;
  daily_task_goal: number;
  current_streak: number;
  longest_streak: number;
  last_goal_met_date: string | null;
  work_day_start: string;
  work_day_end: string;
  pomodoro_work_minutes: number;
  pomodoro_break_minutes: number;
  // New — throttles the "Today's 5" rollover prompt to once per day.
  last_rollover_prompt_date: string | null;
}

// New-spec-1 Feature 5 — focus mode levels. Kept separate from TrackedMode
// (pomodoro variants) so the picker UI can iterate this union cleanly.
export type FocusMode = 'open' | 'call_focus' | 'app_focus' | 'strict';

export type TrackedMode =
  | 'free'
  | 'pomodoro_25_5'
  | 'pomodoro_50_10'
  | FocusMode;

export interface DriftEvent {
  started_at: string;
  ended_at: string;
  duration_seconds: number;
}

export interface TrackedSession {
  id: string;
  user_id: string;
  task_id: string | null;
  subtask_id: string | null;
  planned_block_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  mode: TrackedMode;
  was_paused: boolean;
  drift_events: DriftEvent[];
}

export interface PlannedBlock {
  id: string;
  user_id: string;
  task_id: string | null;
  subtask_id: string | null;
  start_at: string;
  duration_seconds: number;
  block_type: 'work' | 'break' | 'lunch' | 'meeting';
  notes: string | null;
}

export interface NewTaskInput {
  title: string;
  priority: Priority;
  tag_ids: string[];
  due_date: string | null;
  status: Status;
  estimated_seconds?: number | null;
}
