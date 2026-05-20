export type Status = 'todo' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

// Phase 3 — Eisenhower matrix quadrants. Stored on tasks.matrix_quadrant
// (migration 0033). 'unsorted' is the explicit default for tasks that
// haven't been triaged yet; they live in the Unsorted tray.
export type MatrixQuadrant =
  | 'do_first'
  | 'schedule'
  | 'delegate'
  | 'drop'
  | 'unsorted';

export interface SubtaskType {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  total_time_seconds: number;
  // Derived client-side from closed tracked_sessions for this subtask. See the
  // note on TaskType.tracked_total_seconds for why this exists.
  tracked_total_seconds: number;
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
  /**
   * @deprecated Read `effective_status` instead. The legacy `status` column is
   * still writable so mobile (Phase 6 migration) keeps working, but the
   * redesigned UI derives display from `v_task_status` via `effective_status`.
   */
  status: Status;
  /** Derived from `v_task_status` (DB view). The source of truth for display. */
  effective_status: Status;
  /** When the user marked this Done. NULL = not done. The Done checkbox writes this; v_task_status reads it. */
  completed_at: string | null;
  priority: Priority;
  due_date: string | null;
  total_time_seconds: number;
  // Derived client-side from the sum of closed tracked_sessions for this task.
  // Legacy `total_time_seconds` only tracks the old Pomodoro RPC path; the
  // current live-timer flow writes to tracked_sessions without rolling up.
  // Add the two together to get the true "time invested" figure.
  tracked_total_seconds: number;
  estimated_seconds: number | null;
  sort_order: number;
  allow_alarms: boolean;
  // "Today's 5" planning date — the date the user intends to work on this
  // task. Distinct from `due_date` which is the external deadline.
  planned_for_date: string | null;
  // Phase 2 — execution order within the day's set. 1-based; NULL means the
  // task is assigned to the day but hasn't been positioned yet. The Today
  // view sorts ASC by this column; the legacy TodayFiveDrawer continues to
  // sort by `sort_order` so the two surfaces don't fight over namespacing.
  today_sequence: number | null;
  // Phase 3 — Eisenhower-matrix quadrant. Independent of status and
  // today_for_date: a task can be in DO_FIRST AND on Today AND in_progress
  // simultaneously. Defaults to 'unsorted' on the DB side.
  matrix_quadrant: MatrixQuadrant;
  // Phase 1.2 — last time real progress happened on this task (new session,
  // subtask toggle, or task edit). Drives the "not recording time" amber
  // warning state on in-progress tasks. NULL = no progress recorded yet.
  last_progress_at: string | null;
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

// 'paused' is a legacy state from migration 0019. The redesign uses the
// 4-state lifecycle (active | completed | archived). 'paused' stays valid in
// the type so existing rows still satisfy the union, but the manage-projects
// dropdown hides it as an option for new user actions. Treat 'paused' the
// same as 'completed' / 'archived' for "not active" filtering and faded UI.
export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface ProjectType {
  id: string;
  name: string;
  color: string;
  status: ProjectStatus;
  // Phase 1.4 — server-computed flag from v_project_staleness. TRUE when an
  // active project hasn't seen tracked time for more than user_preferences
  // .stale_project_days. Only `active` projects can be stale.
  is_stale?: boolean;
  // Last time any task in this project had a tracked session end. NULL means
  // no tracked activity recorded yet (used as a tooltip on the stale banner).
  last_activity_at?: string | null;
}

export type ViewMode =
  | 'list'
  | 'kanban'
  | 'schedule'
  | 'timeline'
  | 'priority'
  | 'calendar'
  // Phase 2 — sequenced daily execution view; new default landing for new
  // users. Existing users keep whatever the persisted store has.
  | 'today'
  // Phase 3 — Eisenhower 2x2 strategic-triage view. Used weekly, not daily.
  | 'matrix';

// Calendar view (Phase 3 step 10) — per-weekday hour goals.
// Mirrors the daily_targets table from migration 0024. The DB enum allows
// 'balanced' | 'weekend-off' | 'hustle' | 'custom'; the spec's UI labels are
// "Balanced" / "Weekdays only" / "Hustle 7 days" / "Custom".
export type CalendarPreset = 'balanced' | 'weekend-off' | 'hustle' | 'custom';

export interface DailyTargets {
  user_id: string;
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun: number;
  preset_name: CalendarPreset | null;
}

// Phase 6 — per-week goal storage. One row per (user, week_start) per
// migration 0033. week_start is a Sunday in ISO YYYY-MM-DD; working_days
// defaults to 5. daily_goal is derived: goal_hours / working_days.
export interface WeeklyGoal {
  id: string;
  user_id: string;
  week_start: string; // YYYY-MM-DD, Sunday
  goal_hours: number; // 0..168, NUMERIC(4,1)
  working_days: number; // 1..7, default 5
  created_at?: string;
  updated_at?: string;
}

// Filter dimensions for the Board / List filter bar (Change #4).
// Empty arrays mean "no constraint" for that dimension. Across dimensions:
// AND. Within a dimension: OR.
export interface Filters {
  project_ids: string[];
  category_ids: string[];
  tag_ids: string[];
  priorities: Priority[];
}

// saved_views.view_type — DB CHECK constraint allows these four values.
// 'board' covers BoardView, 'list' covers ListView. 'priority' and 'calendar'
// are reserved for Phase 3 views and accepted by the API but not yet wired
// in the UI.
export type SavedViewType = 'board' | 'list' | 'priority' | 'calendar';

export interface SavedView {
  id: string;
  name: string;
  view_type: SavedViewType;
  filters: Filters;
  is_pinned: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

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

export type ScheduleSnapMode = 'hour' | '15min' | 'free';

// Feature 09 — Schedule view sub-tabs. The Schedule top-level view now hosts
// three sub-views; this ticket ships the shell + Day, with Week/Month stubbed
// out for Features 10 & 11.
export type ScheduleSubView = 'day' | 'week' | 'month';

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
  // Feature 01 — Schedule Day view drag/resize snap mode.
  schedule_snap_mode: ScheduleSnapMode;
  // Feature 09 — last-chosen Schedule sub-tab, server-persisted for cross-device sync.
  schedule_default_subview: ScheduleSubView;
  // Phase 1 upgrade — new toggles from migration 0033.
  edit_resets_status: boolean;
  edit_reset_fields: string[];
  warning_threshold_min: number;
  stale_project_days: number;
  hide_completed_default: boolean;
  // Phase 5 upgrade — gap-detection toggles from migration 0034.
  show_break_blocks: boolean;
  break_min_gap_minutes: number;
  // Phase 8 — sticky timer pill from migration 0035.
  sticky_timer_enabled: boolean;
  sticky_timer_position:
    | 'bottom_right'
    | 'bottom_left'
    | 'top_right'
    | 'top_left';
  // Phase 9 — presence detection prefs already exist on user_preferences
  // from migration 0033; mirroring them on the client type here so the
  // Settings panel can read/write without a `as Record<string, unknown>`.
  presence_detection_enabled: boolean;
  presence_break_after_min: number;
  presence_stop_after_min: number;
  presence_method: 'mouse_keyboard' | 'webcam' | 'mobile_motion';
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
  // Feature 05 — Break button (migration 0031). break_seconds is closed-break
  // total; is_on_break + last_break_started_at describe the currently-running
  // break (if any). duration_seconds is always net-of-break by the time it's
  // written, so reports/streaks need no special-casing.
  break_seconds: number;
  is_on_break: boolean;
  last_break_started_at: string | null;
  // Phase 4 — Timeline editing / breaks. From migration 0033.
  // block_type discriminates user-labelled break rows from regular tracked
  // work; break_label is the user-confirmed label ("lunch" / "walk" / etc.);
  // break_auto_detected is true the moment a gap-detection heuristic
  // suggested it and false once the user touches it. manually_entered is the
  // audit flag the Honest Score (Phase 6) reads to discount edited data
  // against the auto-tracked baseline.
  block_type: 'tracked' | 'break';
  break_label: string | null;
  break_auto_detected: boolean;
  manually_entered: boolean;
  note: string | null;
}

// Phase 4 — labels offered by the break label picker. These match the demo's
// six quick buttons. 'other' is a catch-all for custom labels stored as the
// trimmed user string.
export type BreakLabel =
  | 'lunch'
  | 'walk'
  | 'meeting'
  | 'think'
  | 'distract'
  | 'other';

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
export type InsightsRange = 'today' | 'week' | 'month' | 'all';

export interface InsightsBucket {
  id: string;
  name: string;
  color: string;
  total_seconds: number;
}

export interface InsightsProjectBucket extends InsightsBucket {
  status: ProjectStatus;
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
