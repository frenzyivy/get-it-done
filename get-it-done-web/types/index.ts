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
  category_ids: string[];
  project_ids: string[];
  subtasks: SubtaskType[];
  sessions: TimeSession[];
}

export interface TagType {
  id: string;
  name: string;
  color: string;
}

export interface CategoryType {
  id: string;
  name: string;
  color: string;
}

export type ProjectStatus = 'active' | 'paused' | 'archived';

export interface ProjectType {
  id: string;
  name: string;
  color: string;
  status: ProjectStatus;
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
  // Focus Lock (migration 0018). Broken = user exited a Strict session early;
  // planned_duration_seconds = duration chip picked on the lock picker.
  broken: boolean;
  broken_reason: string | null;
  planned_duration_seconds: number | null;
}

// Focus Lock — UI labels map 1:1 to focus modes. Parity with mobile.
export type FocusLockLevel = 'just_track' | 'focus' | 'no_mercy';

export const FOCUS_LOCK_TO_MODE: Record<FocusLockLevel, FocusMode> = {
  just_track: 'open',
  focus: 'app_focus',
  no_mercy: 'strict',
};

export const MODE_TO_FOCUS_LOCK: Partial<Record<FocusMode, FocusLockLevel>> = {
  open: 'just_track',
  app_focus: 'focus',
  strict: 'no_mercy',
};

// Recurring templates — blueprints materialized into tasks by the
// `create-recurring-tasks` Edge Function on a schedule.
export type RecurringFrequency = 'daily' | 'weekdays' | 'weekly' | 'monthly';

export interface RecurringTemplate {
  id: string;
  user_id: string;
  title: string;
  priority: Priority;
  tag_ids: string[];
  subtask_titles: string[];
  frequency: RecurringFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  hour_local: number;
  is_enabled: boolean;
  last_materialized_at: string | null;
}

export interface NewRecurringTemplateInput {
  title: string;
  priority: Priority;
  tag_ids: string[];
  subtask_titles: string[];
  frequency: RecurringFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  hour_local: number;
  is_enabled: boolean;
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
  category_ids?: string[];
  project_ids?: string[];
  due_date: string | null;
  status: Status;
  estimated_seconds?: number | null;
}

// Insights page — range passed to /api/insights?range=...
export type InsightsRange = 'week' | 'month' | 'all';

export interface InsightsBucket {
  id: string;
  name: string;
  color: string;
  total_seconds: number;
}

export interface InsightsProjectBucket extends InsightsBucket {
  status: 'active' | 'paused' | 'archived';
  task_count: number;
}

export interface InsightsTagBucket {
  id: string;
  name: string;
  total_seconds: number;
}

export interface InsightsMatrixRow {
  project_id: string;
  project_name: string;
  project_color: string;
  cells: Record<string, number>; // category_id -> seconds
  total_seconds: number;
}

export interface InsightsTask {
  id: string;
  title: string;
  total_seconds: number;
  categories: { id: string; name: string; color: string }[];
}

export interface InsightsSummary {
  total_seconds: number;
  total_seconds_prev: number;
  task_count: number;
  top_category: InsightsBucket | null;
  top_category_pct: number;
  top_project: InsightsProjectBucket | null;
  deepest_day: { date: string; total_seconds: number } | null;
}

export interface InsightsPayload {
  range: InsightsRange;
  range_start: string | null; // ISO, null for all-time
  range_end: string;          // ISO
  summary: InsightsSummary;
  categories: InsightsBucket[];
  projects: InsightsProjectBucket[];
  matrix: {
    category_order: { id: string; name: string; color: string }[];
    rows: InsightsMatrixRow[];
  };
  // Tasks grouped by project id — client slices per active project
  tasks_by_project: Record<string, InsightsTask[]>;
  // Drill-down by project: project_id -> category buckets (uses this project's tasks only)
  categories_by_project: Record<string, InsightsBucket[]>;
  tags: InsightsTagBucket[];
  // Double-filter: tag_id -> category buckets
  categories_by_tag: Record<string, InsightsBucket[]>;
  // true if Agent 1's schema isn't deployed yet
  missing_label_schema?: boolean;
}
