import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from './supabase';
import type {
  TaskType,
  TagType,
  CategoryType,
  ProjectType,
  ProjectStatus,
  SubtaskType,
  TimeSession,
  ViewMode,
  NewTaskInput,
  Status,
  MatrixQuadrant,
  WeeklyGoal,
  NotificationType,
  UserPrefs,
  AutomationRule,
  UserProfileV2,
  TrackedSession,
  PlannedBlock,
  FocusMode,
  ScheduleSubView,
  DriftEvent,
  RecurringTemplate,
  NewRecurringTemplateInput,
  InsightsPayload,
  InsightsRange,
  Filters,
  SavedView,
  SavedViewType,
  DailyTargets,
} from '@/types';

const EMPTY_FILTERS: Filters = {
  project_ids: [],
  category_ids: [],
  tag_ids: [],
  priorities: [],
};

// Phase 4 — bag of optional metadata for retroactive session edits / adds.
// Every field is optional so the existing call sites that pass only positional
// args keep working; the modal opts in for break_type / labels / notes.
export interface SessionEditOpts {
  blockType?: 'tracked' | 'break';
  breakLabel?: string | null;
  breakAutoDetected?: boolean;
  note?: string | null;
  // manually_entered is always written TRUE on edit / add — that's the whole
  // point of the audit flag — but exposing the option lets a future caller
  // (e.g. a presence-detection auto-break in Phase 9) write FALSE.
  manuallyEntered?: boolean;
}

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: Status;
  completed_at: string | null;
  priority: TaskType['priority'];
  due_date: string | null;
  total_time_seconds: number;
  estimated_seconds: number | null;
  sort_order: number;
  allow_alarms: boolean | null;
  planned_for_date: string | null;
  today_sequence: number | null;
  matrix_quadrant: MatrixQuadrant | null;
  last_progress_at: string | null;
  subtasks: SubtaskRow[] | null;
  task_tags: { tag_id: string }[] | null;
  task_categories: { category_id: string }[] | null;
  task_projects: { project_id: string }[] | null;
  time_sessions: TimeSession[] | null;
  // Tracked sessions rolled up for the "time invested" chip. Open sessions
  // (ended_at NULL) are filtered out in rowToTask — they contribute live via
  // activeSessions / useLiveTimers, so including them would double-count.
  tracked_sessions: {
    subtask_id: string | null;
    duration_seconds: number | null;
    ended_at: string | null;
  }[] | null;
}

interface SubtaskRow {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  total_time_seconds: number;
  sort_order: number;
}

/**
 * Mirror of v_task_status (migration 0023) — used for OPTIMISTIC updates only.
 * The DB-derived value from v_task_status is the source of truth and replaces
 * this on the next fetchTasks. Mirroring the SQL avoids visual flicker between
 * a write and the refetch.
 *
 * Limitation: v_task_status promotes a task to 'in_progress' when there's an
 * OPEN session on it (ended_at IS NULL). `task.sessions` only contains closed
 * time_sessions rows, so this helper can't see open sessions on its own. For
 * Done-checkbox toggles (where completed_at is the only thing changing) and
 * for any update that doesn't start/stop a session, this is fine. Open
 * sessions are managed separately via `activeSessions[]`.
 */
function deriveEffectiveStatus(
  task: Pick<TaskType, 'completed_at' | 'sessions'>,
): Status {
  if (task.completed_at) return 'done';
  const hasWork = task.sessions.some((s) => (s.duration_seconds ?? 0) > 0);
  if (hasWork) return 'in_progress';
  return 'todo';
}

function rowToTask(row: TaskRow, effectiveStatus: Status): TaskType {
  // Roll up closed tracked_sessions per subtask and for the task overall.
  // Open sessions (ended_at NULL) are excluded by the query — they contribute
  // live via useLiveTimers.
  const tracked = row.tracked_sessions ?? [];
  let trackedTotalForTask = 0;
  let latestSessionEndMs = 0;
  const subtaskTrackedSums = new Map<string, number>();
  for (const s of tracked) {
    // Skip open sessions — useLiveTimers already shows them live and adding
    // duration_seconds (often null or stale) here would double-count.
    if (s.ended_at === null) continue;
    const d = s.duration_seconds ?? 0;
    if (s.subtask_id) {
      subtaskTrackedSums.set(s.subtask_id, (subtaskTrackedSums.get(s.subtask_id) ?? 0) + d);
    }
    // Sum task-level total over ALL closed sessions on the task (task-level
    // and subtask-level), so the chip reflects every second logged on the card.
    trackedTotalForTask += d;
    const endMs = new Date(s.ended_at).getTime();
    if (Number.isFinite(endMs) && endMs > latestSessionEndMs) {
      latestSessionEndMs = endMs;
    }
  }
  // Fallback for `last_progress_at`: stopSession didn't always stamp the column
  // historically, so old tasks have a stale value. Treat the most recent
  // tracked_session ended_at as a floor so the "no time logged in Xm" warning
  // reflects real activity.
  const rowProgressMs = row.last_progress_at
    ? new Date(row.last_progress_at).getTime()
    : 0;
  const lastProgressMs = Math.max(rowProgressMs, latestSessionEndMs);
  const lastProgressAt =
    lastProgressMs > 0 ? new Date(lastProgressMs).toISOString() : row.last_progress_at ?? null;
  const subtasks = (row.subtasks ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      ...s,
      tracked_total_seconds: subtaskTrackedSums.get(s.id) ?? 0,
    }));
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    effective_status: effectiveStatus,
    completed_at: row.completed_at ?? null,
    priority: row.priority,
    due_date: row.due_date,
    total_time_seconds: row.total_time_seconds,
    tracked_total_seconds: trackedTotalForTask,
    estimated_seconds: row.estimated_seconds ?? null,
    sort_order: row.sort_order,
    allow_alarms: row.allow_alarms ?? false,
    planned_for_date: row.planned_for_date ?? null,
    today_sequence: row.today_sequence ?? null,
    matrix_quadrant: (row.matrix_quadrant ?? 'unsorted') as MatrixQuadrant,
    last_progress_at: lastProgressAt,
    tag_ids: (row.task_tags ?? []).map((t) => t.tag_id),
    category_ids: (row.task_categories ?? []).map((c) => c.category_id),
    project_ids: (row.task_projects ?? []).map((p) => p.project_id),
    subtasks,
    sessions: row.time_sessions ?? [],
  };
}

interface Store {
  tasks: TaskType[];
  tags: TagType[];
  categories: CategoryType[];
  projects: ProjectType[];
  view: ViewMode;
  userId: string | null;
  loading: boolean;

  notifications: NotificationType[];
  prefs: UserPrefs | null;
  rules: AutomationRule[];
  notifUnsubscribe: (() => void) | null;

  setView: (view: ViewMode) => void;
  setUserId: (id: string | null) => void;

  fetchTags: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchTasks: () => Promise<void>;
  fetchAll: () => Promise<void>;

  fetchNotifications: () => Promise<void>;
  subscribeNotifications: () => void;
  unsubscribeNotifications: () => void;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;

  fetchPrefs: () => Promise<void>;
  updatePrefs: (updates: Partial<UserPrefs>) => Promise<void>;

  fetchRules: () => Promise<void>;
  toggleRule: (ruleKey: string, isEnabled: boolean) => Promise<void>;

  // v2 — plan vs reality
  profileV2: UserProfileV2 | null;
  // New-spec-1 Feature 4 — concurrent timers. Array of all live sessions.
  activeSessions: TrackedSession[];
  activeColumn: Status;
  lastStopSummary: { durationSeconds: number; at: number } | null;
  // New-spec-1 Feature 5 — which session the focus-mode fullscreen is showing.
  focusSessionId: string | null;
  // Focus Lock — target task/subtask while the picker sheet is open. null = closed.
  focusLockPicker: { taskId: string; subtaskId: string | null } | null;
  openFocusLockPicker: (taskId: string, subtaskId?: string | null) => void;
  closeFocusLockPicker: () => void;
  fetchProfileV2: () => Promise<void>;
  // "Today's 5" rollover prompt — persists the date the prompt last fired so
  // it only shows once per calendar day.
  updateRolloverPromptDate: (dateISO: string) => Promise<void>;
  // Bulk-sets planned_for_date on many tasks at once (used by the rollover
  // prompt's "Bring N tasks to today" confirm button).
  setPlannedForDateBulk: (
    updates: { id: string; planned_for_date: string | null }[],
  ) => Promise<void>;
  // Phase 2 — Today view drag-to-reorder. Rewrites today_sequence on every
  // task in the given list to 1..N. Date scopes the write so the user isn't
  // accidentally reordering a different day's set.
  reorderToday: (date: string, orderedTaskIds: string[]) => Promise<void>;
  // Phase 2 — append a task to a day's sequence. Sets planned_for_date and
  // assigns the next available today_sequence number for that date.
  addTaskToToday: (taskId: string, date: string) => Promise<void>;
  // Phase 3 — move a task into a Matrix quadrant. Independent of status and
  // today_for_date; a task can be in DO_FIRST and on Today and in_progress
  // simultaneously. Thin wrapper over updateTask with the optimistic update
  // and PATCH wired in one place.
  setMatrixQuadrant: (taskId: string, quadrant: MatrixQuadrant) => Promise<void>;
  fetchActiveSessions: () => Promise<void>;
  setActiveColumn: (col: Status) => void;
  startTrackingTask: (
    taskId: string,
    subtaskId?: string | null,
    mode?: FocusMode,
    plannedDurationSeconds?: number | null,
  ) => Promise<TrackedSession | null>;
  completeSession: (sessionId: string) => Promise<void>;
  markSessionBroken: (sessionId: string, reason: string) => Promise<void>;
  pauseSession: (sessionId: string) => Promise<void>;
  startBreak: (sessionId: string) => Promise<void>;
  endBreak: (sessionId: string) => Promise<void>;
  updateSessionTimes: (
    sessionId: string,
    startedAtISO: string,
    endedAtISO: string,
    // Phase 4 — optional metadata bag. Anything passed here is written
    // alongside the times. manually_entered is forced to true for any
    // explicit call because by definition the user is retroactively editing.
    opts?: SessionEditOpts,
  ) => Promise<void>;
  // Manually log a session after the fact — used by the Timeline date nav so
  // past days can be backfilled with time that was forgotten / not tracked.
  // Phase 4 — accepts the same opts bag so the same modal can create breaks
  // and notes in one call instead of insert-then-patch.
  addSession: (
    taskId: string | null,
    startedAtISO: string,
    endedAtISO: string,
    opts?: SessionEditOpts,
  ) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;
  persistActiveSessionDurations: () => Promise<void>;
  appendDriftEvent: (sessionId: string, drift: DriftEvent) => Promise<void>;
  updateSessionMode: (sessionId: string, mode: FocusMode) => Promise<void>;
  openFocusMode: (sessionId: string) => void;
  closeFocusMode: () => void;
  clearStopSummary: () => void;

  recurringTemplates: RecurringTemplate[];
  fetchRecurringTemplates: () => Promise<void>;
  addRecurringTemplate: (input: NewRecurringTemplateInput) => Promise<void>;
  updateRecurringTemplate: (
    id: string,
    updates: Partial<NewRecurringTemplateInput>,
  ) => Promise<void>;
  deleteRecurringTemplate: (id: string) => Promise<void>;
  toggleRecurringTemplate: (id: string, isEnabled: boolean) => Promise<void>;

  plannedBlocks: PlannedBlock[];
  fetchPlannedBlocks: (fromISO: string, toISO: string) => Promise<void>;
  addPlannedBlock: (input: Omit<PlannedBlock, 'id' | 'user_id'>) => Promise<void>;
  updatePlannedBlock: (id: string, updates: Partial<PlannedBlock>) => Promise<void>;
  deletePlannedBlock: (id: string) => Promise<void>;

  addTask: (input: NewTaskInput) => Promise<string | null>;
  updateTask: (id: string, updates: Partial<TaskType>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  moveTask: (id: string, status: Status) => Promise<void>;

  addSubtask: (taskId: string, title: string) => Promise<void>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  renameSubtask: (taskId: string, subtaskId: string, title: string) => Promise<void>;
  deleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  reorderSubtasks: (taskId: string, orderedIds: string[]) => Promise<void>;

  saveTimeSession: (
    taskId: string,
    subtaskId: string | null,
    startedAt: string,
    duration: number,
    label: string,
  ) => Promise<void>;

  addTag: (name: string, color: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  updateTaskTags: (taskId: string, tagIds: string[]) => Promise<void>;

  // Categories (AGENT1) — parallel to tags. CRUD goes via /api/categories so
  // mobile and web share one implementation.
  addCategory: (name: string, color?: string) => Promise<CategoryType | null>;
  updateCategory: (id: string, updates: { name?: string; color?: string }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  attachCategoryToTask: (taskId: string, categoryId: string) => Promise<void>;
  detachCategoryFromTask: (taskId: string, categoryId: string) => Promise<void>;
  updateTaskCategories: (taskId: string, categoryIds: string[]) => Promise<void>;

  // Projects (AGENT1) — same shape as categories, plus status.
  addProject: (
    name: string,
    color?: string,
    status?: ProjectStatus,
  ) => Promise<ProjectType | null>;
  updateProject: (
    id: string,
    updates: { name?: string; color?: string; status?: ProjectStatus },
  ) => Promise<void>;
  setProjectStatus: (id: string, status: ProjectStatus) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  attachProjectToTask: (taskId: string, projectId: string) => Promise<void>;
  detachProjectFromTask: (taskId: string, projectId: string) => Promise<void>;
  updateTaskProjects: (taskId: string, projectIds: string[]) => Promise<void>;

  // Transient toast (Change #1 bounce-back, plus any future ephemeral
  // feedback). `id` increments per toast so an auto-dismiss timer can detect
  // whether a newer toast superseded it. The optional `action` lets a toast
  // carry an inline button (e.g. "Undo") that the Toast component renders.
  toast: {
    message: string;
    id: number;
    action?: { kind: 'edit_reset_undo'; taskId: string; previousStatus: Status };
  } | null;
  showToast: (message: string) => void;
  dismissToast: (id?: number) => void;

  // Phase 1.3 — edit-resets-status helpers.
  showResetUndoToast: (taskId: string, previousStatus: Status) => void;
  undoEditReset: (taskId: string, previousStatus: Status) => Promise<void>;

  // Phase 1.1 — Hide-completed default-on toggle, per-view multi-tracked.
  // Persisted via the same zustand persist slice as filters. Reads
  // user_preferences.hide_completed_default as the initial value the first
  // time prefs load.
  showCompleted: boolean;
  setShowCompleted: (v: boolean) => void;

  // Quick-add command bar (Phase 5 step 15) — global open state. Ctrl/Cmd+K
  // toggles; Esc / outside-click / submit close. Component owns the input
  // buffer and parse state internally.
  quickAddOpen: boolean;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;

  // Filter bar (Change #4) — across-dimensions AND, within-dimension OR.
  // Persisted via zustand/middleware/persist on the `filters` slice only.
  filters: Filters;
  setFilters: (f: Filters) => void;
  clearFilter: (dim: keyof Filters, value: string) => void;
  clearAllFilters: () => void;

  // Feature 07 — live-filter search. Combined with `filters` via AND in the
  // views (BoardView/ListView/PriorityView/Schedule sidebar). Not persisted —
  // URL `?q=` is the source of truth across reloads.
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Feature 07 delta — drag-from-results. The dropdown panel is rendered
  // inside each view's DndContext (not inside TaskSearchInput) because
  // @dnd-kit cannot drag across context boundaries. We publish the input's
  // bounding rect here so the views can position the panel underneath it.
  // `searchDropdownOpen` is the explicit open flag — true when the input is
  // focused AND query is non-empty.
  searchAnchorRect: { top: number; left: number; width: number } | null;
  setSearchAnchorRect: (r: { top: number; left: number; width: number } | null) => void;
  searchDropdownOpen: boolean;
  setSearchDropdownOpen: (open: boolean) => void;

  // Feature 09 (minimal) — Schedule view sub-tab. Lets the Schedule view
  // switch between Day, Week, and Month renderings. Week is a placeholder.
  // `scheduleDayStartMs` is the date the Day sub-view loads — kept here (not
  // local to ScheduleView) so the Month grid can drill into a specific day.
  scheduleSubView: ScheduleSubView;
  setScheduleSubView: (v: ScheduleSubView) => void;
  scheduleDayStartMs: number;
  setScheduleDayStart: (d: Date) => void;
  // One-shot scroll intent: when the Week view drills into Day at a specific
  // hour, the Day view consumes this on mount/update and clears it back to
  // null. null = no pending scroll.
  pendingScrollHour: number | null;
  setPendingScrollHour: (h: number | null) => void;

  // Calendar view (Phase 3 step 10) — per-weekday hour goals + per-day
  // tracked seconds. `dailyTargets` is one row from `daily_targets`;
  // `secondsByDay` is keyed YYYY-MM-DD in user tz, populated by
  // fetchSessionsByDay(from, to).
  dailyTargets: DailyTargets | null;
  fetchDailyTargets: () => Promise<void>;
  updateDailyTargets: (updates: Partial<DailyTargets>) => Promise<void>;
  secondsByDay: Record<string, number>;
  secondsByDayRange: { from: string; to: string } | null;
  fetchSessionsByDay: (from: string, to: string) => Promise<void>;

  // Phase 6 — per-week goal storage. weeklyGoals is keyed by week_start
  // (YYYY-MM-DD Sunday). Loaded lazily by the Calendar / This Week panel; the
  // resolver `getEffectiveWeeklyGoal` falls back to the most recent past
  // week's goal, then to user_preferences.weekly_work_goal_hours, then 40h.
  weeklyGoals: Record<string, WeeklyGoal>;
  // ISO range we've already fetched, so panel pagination doesn't re-fetch.
  weeklyGoalsFetchedRange: { from: string; to: string } | null;
  fetchWeeklyGoals: (fromWeekStart: string, toWeekStart: string) => Promise<void>;
  // Upsert a week's goal. Pass goal_hours and working_days; the row is
  // identified by (user_id, week_start) per the UNIQUE constraint in
  // migration 0033. Returns the upserted row.
  setWeeklyGoal: (
    weekStart: string,
    goalHours: number,
    workingDays: number,
  ) => Promise<WeeklyGoal | null>;

  // Schedule view (Phase 6 step 17) — detailed sessions for a single day, used
  // to render the "actual" overlay alongside planned blocks. Key is the
  // YYYY-MM-DD date the data was fetched for.
  daySessions: {
    date: string;
    sessions: {
      id: string;
      task_id: string | null;
      subtask_id: string | null;
      started_at: string;
      ended_at: string | null;
      duration_seconds: number | null;
      mode: string | null;
    }[];
  } | null;
  fetchDaySessions: (date: string, force?: boolean) => Promise<void>;

  // Feature 15 — server-aggregated planned/tracked totals for the Schedule
  // Day header. tracked_seconds excludes the running session, which the
  // client adds live via useLiveTimers().
  dayStats: {
    date: string;
    planned_seconds: number;
    tracked_seconds: number;
  } | null;
  fetchDayStats: (date: string, force?: boolean) => Promise<void>;

  // When You Work heatmap (Phase 4 step 12) — 7x24 matrix from
  // /api/sessions/by-hour-of-week, keyed [day][hour] where day is 0=Sun..6=Sat
  // (matching JS Date.getDay()). Range is local to the heatmap card.
  hourOfWeekRange: '7d' | '30d' | '90d';
  hourOfWeekMatrix: number[][] | null;
  hourOfWeekFetchedFor: '7d' | '30d' | '90d' | null;
  setHourOfWeekRange: (range: '7d' | '30d' | '90d') => void;
  fetchHourOfWeek: (force?: boolean) => Promise<void>;

  // Streak history (Phase 6 backlog) — last 84 days of streak length per
  // /api/insights/streak-history. Cache-keyed by today's date so a new day
  // refetches without forcing.
  streakHistory: {
    days: { date: string; streak: number; qualified: boolean }[];
    peakValue: number;
    peakDate: string | null;
    today: string;
  } | null;
  streakHistoryFetchedFor: string | null;
  fetchStreakHistory: (force?: boolean) => Promise<void>;

  // Saved views — per-user named filter combos scoped to one view_type.
  savedViews: SavedView[];
  fetchSavedViews: () => Promise<void>;
  saveView: (name: string, viewType: SavedViewType, filters: Filters) => Promise<SavedView | null>;
  loadView: (id: string) => void;
  renameView: (id: string, name: string) => Promise<void>;
  deleteView: (id: string) => Promise<void>;

  // Status-count pills shown in the saved-views dropdown (Feature 06).
  // Map keyed by view_id; refreshed lazily when the dropdown opens, with a
  // 60s memo invalidated by any task or saved-view mutation.
  savedViewCounts: Record<string, { todo: number; in_progress: number; done: number }>;
  savedViewCountsFetchedAt: number | null;
  fetchSavedViewCounts: () => Promise<void>;

  // Phase 7 — Honest Score (yesterday-by-default). Cached per-date to keep
  // the Insights hero card snappy when the user toggles range.
  honestScore: {
    date: string;
    planned_seconds: number;
    tracked_seconds: number;
    on_plan_seconds: number;
    off_plan_seconds: number;
    break_seconds: number;
    manual_seconds: number;
    honest_score_pct: number;
    manual_share_pct: number;
    manual_caveat: boolean;
  } | null;
  honestScoreLoading: boolean;
  honestScoreError: string | null;
  fetchHonestScore: (date?: string, force?: boolean) => Promise<void>;

  // Insights page state. Payload cached per-range for 60s to keep the
  // range-toggle snappy. `selectedProjectId` / `selectedTagId` are client-only
  // drill-down picks; they reset when the payload changes.
  insightsRange: InsightsRange;
  insightsPayload: InsightsPayload | null;
  insightsLoading: boolean;
  insightsError: string | null;
  insightsFetchedAt: number;
  insightsFetchedForRange: InsightsRange | null;
  insightsSelectedProjectId: string | null;
  insightsSelectedTagId: string | null;
  setInsightsRange: (range: InsightsRange) => void;
  fetchInsights: (force?: boolean) => Promise<void>;
  setInsightsSelectedProject: (id: string | null) => void;
  setInsightsSelectedTag: (id: string | null) => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
  tasks: [],
  tags: [],
  categories: [],
  projects: [],
  // Phase 2 — Today view is the new default landing. Persisted across
  // reloads via the zustand persist partialize below, so existing users who
  // last had Board/List/etc. keep their choice; brand-new browsers start on
  // Today.
  view: 'today',
  userId: null,
  loading: false,

  // ---- Transient toast ----------------------------------------------------
  toast: null,
  showToast: (message) =>
    set((s) => ({
      toast: { message, id: (s.toast?.id ?? 0) + 1 },
    })),
  dismissToast: (id) =>
    set((s) => {
      // If an `id` is passed, only dismiss when it matches — that lets a
      // setTimeout from an older toast no-op safely after a newer one took
      // over the slot.
      if (id != null && s.toast?.id !== id) return {};
      return { toast: null };
    }),

  // ---- Quick-add command bar ----------------------------------------------
  quickAddOpen: false,
  openQuickAdd: () => set({ quickAddOpen: true }),
  closeQuickAdd: () => set({ quickAddOpen: false }),

  // ---- Phase 1.1 — hide completed (default: hidden) ----------------------
  showCompleted: false,
  setShowCompleted: (v) => set({ showCompleted: v }),

  // ---- Calendar (Phase 3 step 10) -----------------------------------------
  dailyTargets: null,
  secondsByDay: {},
  secondsByDayRange: null,
  fetchDailyTargets: async () => {
    const { userId } = get();
    if (!userId) return;
    const res = await fetch('/api/daily-targets', { credentials: 'include' });
    if (!res.ok) {
      console.error('[store.fetchDailyTargets]', await res.text());
      return;
    }
    const json = (await res.json()) as { daily_targets: DailyTargets };
    set({ dailyTargets: json.daily_targets });
  },
  updateDailyTargets: async (updates) => {
    const prev = get().dailyTargets;
    if (prev) {
      // Optimistic — apply locally, then PUT and reconcile with server response.
      set({ dailyTargets: { ...prev, ...updates } });
    }
    const res = await fetch('/api/daily-targets', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      console.error('[store.updateDailyTargets]', await res.text());
      if (prev) set({ dailyTargets: prev });
      return;
    }
    const json = (await res.json()) as { daily_targets: DailyTargets };
    set({ dailyTargets: json.daily_targets });
  },
  hourOfWeekRange: '30d',
  hourOfWeekMatrix: null,
  hourOfWeekFetchedFor: null,
  setHourOfWeekRange: (range) => {
    set({ hourOfWeekRange: range });
    void get().fetchHourOfWeek();
  },
  fetchHourOfWeek: async (force) => {
    const { userId, hourOfWeekRange, hourOfWeekFetchedFor } = get();
    if (!userId) return;
    if (!force && hourOfWeekFetchedFor === hourOfWeekRange) return;
    const res = await fetch(
      `/api/sessions/by-hour-of-week?range=${hourOfWeekRange}`,
      { credentials: 'include' },
    );
    if (!res.ok) {
      console.error('[store.fetchHourOfWeek]', await res.text());
      return;
    }
    const json = (await res.json()) as {
      seconds_by_day_hour: number[][];
    };
    set({
      hourOfWeekMatrix: json.seconds_by_day_hour,
      hourOfWeekFetchedFor: hourOfWeekRange,
    });
  },

  streakHistory: null,
  streakHistoryFetchedFor: null,
  fetchStreakHistory: async (force) => {
    const { userId, streakHistoryFetchedFor } = get();
    if (!userId) return;
    // Cache key is the user-tz "today" the server returned last time. We
    // approximate it with the local-tz date string here; the server is the
    // source of truth, so a stale local key just causes one extra fetch.
    const localTodayKey = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();
    if (!force && streakHistoryFetchedFor === localTodayKey) return;
    const res = await fetch('/api/insights/streak-history', {
      credentials: 'include',
    });
    if (!res.ok) {
      console.error('[store.fetchStreakHistory]', await res.text());
      return;
    }
    const json = (await res.json()) as {
      days: { date: string; streak: number; qualified: boolean }[];
      peak_value: number;
      peak_date: string | null;
      today: string;
    };
    set({
      streakHistory: {
        days: json.days,
        peakValue: json.peak_value,
        peakDate: json.peak_date,
        today: json.today,
      },
      streakHistoryFetchedFor: json.today,
    });
  },

  daySessions: null,
  fetchDaySessions: async (date, force) => {
    const { userId, daySessions } = get();
    if (!userId) return;
    if (!force && daySessions?.date === date) return;
    const res = await fetch(
      `/api/sessions/by-day-detailed?date=${encodeURIComponent(date)}`,
      { credentials: 'include' },
    );
    if (!res.ok) {
      console.error('[store.fetchDaySessions]', await res.text());
      return;
    }
    const json = (await res.json()) as {
      date: string;
      sessions: {
        id: string;
        task_id: string | null;
        subtask_id: string | null;
        started_at: string;
        ended_at: string | null;
        duration_seconds: number | null;
        mode: string | null;
      }[];
    };
    set({ daySessions: { date: json.date, sessions: json.sessions } });
  },

  dayStats: null,
  fetchDayStats: async (date, force) => {
    const { userId, dayStats } = get();
    if (!userId) return;
    if (!force && dayStats?.date === date) return;
    const res = await fetch(
      `/api/sessions/day-stats?date=${encodeURIComponent(date)}`,
      { credentials: 'include' },
    );
    if (!res.ok) {
      console.error('[store.fetchDayStats]', await res.text());
      return;
    }
    const json = (await res.json()) as {
      date: string;
      planned_seconds: number;
      tracked_seconds: number;
    };
    set({
      dayStats: {
        date: json.date,
        planned_seconds: json.planned_seconds,
        tracked_seconds: json.tracked_seconds,
      },
    });
  },

  fetchSessionsByDay: async (from, to) => {
    const { userId } = get();
    if (!userId) return;
    const res = await fetch(
      `/api/sessions/by-day?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { credentials: 'include' },
    );
    if (!res.ok) {
      console.error('[store.fetchSessionsByDay]', await res.text());
      return;
    }
    const json = (await res.json()) as {
      from: string;
      to: string;
      seconds_by_day: Record<string, number>;
    };
    set({
      secondsByDay: json.seconds_by_day,
      secondsByDayRange: { from: json.from, to: json.to },
    });
  },

  // ---- Phase 6 — weekly_goals ---------------------------------------------
  weeklyGoals: {},
  weeklyGoalsFetchedRange: null,
  fetchWeeklyGoals: async (fromWeekStart, toWeekStart) => {
    const { userId } = get();
    if (!userId) return;
    // No Next route for this — same pattern as fetchProjects: query Supabase
    // directly and rely on RLS for tenant scoping.
    const { data, error } = await supabase()
      .from('weekly_goals')
      .select('id, user_id, week_start, goal_hours, working_days, created_at, updated_at')
      .eq('user_id', userId)
      .gte('week_start', fromWeekStart)
      .lte('week_start', toWeekStart);
    if (error) {
      console.error('[store.fetchWeeklyGoals]', error.message);
      return;
    }
    const next: Record<string, WeeklyGoal> = { ...get().weeklyGoals };
    for (const row of (data ?? []) as WeeklyGoal[]) {
      next[row.week_start] = row;
    }
    set({
      weeklyGoals: next,
      weeklyGoalsFetchedRange: { from: fromWeekStart, to: toWeekStart },
    });
  },

  setWeeklyGoal: async (weekStart, goalHours, workingDays) => {
    const { userId } = get();
    if (!userId) return null;
    // Optimistic local upsert so the panel responds to typing without a
    // round trip. The .upsert below resolves with the canonical row; we
    // replace once it lands. onConflict targets the (user_id, week_start)
    // UNIQUE constraint from migration 0033.
    const optimistic: WeeklyGoal = {
      id: get().weeklyGoals[weekStart]?.id ?? 'optimistic-' + weekStart,
      user_id: userId,
      week_start: weekStart,
      goal_hours: goalHours,
      working_days: workingDays,
    };
    set((s) => ({
      weeklyGoals: { ...s.weeklyGoals, [weekStart]: optimistic },
    }));
    const { data, error } = await supabase()
      .from('weekly_goals')
      .upsert(
        {
          user_id: userId,
          week_start: weekStart,
          goal_hours: goalHours,
          working_days: workingDays,
        },
        { onConflict: 'user_id,week_start' },
      )
      .select()
      .single();
    if (error) {
      console.error('[store.setWeeklyGoal]', error.message);
      return null;
    }
    const row = data as WeeklyGoal;
    set((s) => ({
      weeklyGoals: { ...s.weeklyGoals, [weekStart]: row },
    }));
    return row;
  },

  // ---- Filter bar (Change #4) ---------------------------------------------
  filters: { ...EMPTY_FILTERS },
  setFilters: (f) => set({ filters: f }),
  clearFilter: (dim, value) =>
    set((s) => {
      const arr = s.filters[dim] as string[];
      const next = arr.filter((x) => x !== value);
      return { filters: { ...s.filters, [dim]: next } };
    }),
  clearAllFilters: () => set({ filters: { ...EMPTY_FILTERS } }),

  // ---- Feature 07 — live-filter search ------------------------------------
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  searchAnchorRect: null,
  setSearchAnchorRect: (r) => set({ searchAnchorRect: r }),
  searchDropdownOpen: false,
  setSearchDropdownOpen: (open) => set({ searchDropdownOpen: open }),

  // ---- Feature 09 (minimal) — Schedule sub-tab ----------------------------
  scheduleSubView: 'day',
  setScheduleSubView: (v) => {
    set({ scheduleSubView: v });
    // Round-trip the choice to user_preferences so it syncs across devices.
    // updatePrefs no-ops if prefs hasn't loaded yet — local state still
    // updates and the next change will sync once prefs arrive.
    void get().updatePrefs({ schedule_default_subview: v });
  },
  scheduleDayStartMs: (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })(),
  setScheduleDayStart: (d) => {
    const local = new Date(d);
    local.setHours(0, 0, 0, 0);
    set({ scheduleDayStartMs: local.getTime() });
  },
  pendingScrollHour: null,
  setPendingScrollHour: (h) => set({ pendingScrollHour: h }),

  // ---- Saved views --------------------------------------------------------
  savedViews: [],
  fetchSavedViews: async () => {
    const { userId } = get();
    if (!userId) return;
    const res = await fetch('/api/saved-views', { credentials: 'include' });
    if (!res.ok) {
      console.error('[store.fetchSavedViews]', await res.text());
      return;
    }
    const json = (await res.json()) as { saved_views: SavedView[] };
    set({ savedViews: json.saved_views });
  },
  saveView: async (name, viewType, filters) => {
    const res = await fetch('/api/saved-views', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, view_type: viewType, filters }),
    });
    if (!res.ok) {
      console.error('[store.saveView]', await res.text());
      return null;
    }
    const json = (await res.json()) as { saved_view: SavedView };
    set((s) => ({
      savedViews: [...s.savedViews, json.saved_view],
      savedViewCountsFetchedAt: null,
    }));
    return json.saved_view;
  },
  loadView: (id) => {
    const view = get().savedViews.find((v) => v.id === id);
    if (!view) return;
    // Selecting a saved view should never yank the user out of a view that
    // already supports filters — they expect the chips to apply in place. We
    // only switch view when the current view doesn't support saved views
    // (e.g. Today, Matrix, Schedule, Timeline, Calendar) — in that case fall
    // back to the saved view's stored view_type.
    const currentView = get().view;
    const currentSupports =
      currentView === 'kanban' ||
      currentView === 'list' ||
      currentView === 'priority';
    const fallback: ViewMode | null =
      view.view_type === 'board'
        ? 'kanban'
        : view.view_type === 'list'
          ? 'list'
          : view.view_type === 'priority'
            ? 'priority'
            : null;
    const nextView = currentSupports ? null : fallback;
    set({
      filters: {
        project_ids: view.filters.project_ids ?? [],
        category_ids: view.filters.category_ids ?? [],
        tag_ids: view.filters.tag_ids ?? [],
        priorities: view.filters.priorities ?? [],
      },
      ...(nextView ? { view: nextView } : {}),
    });
  },
  renameView: async (id, name) => {
    const res = await fetch(`/api/saved-views/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      console.error('[store.renameView]', await res.text());
      return;
    }
    const json = (await res.json()) as { saved_view: SavedView };
    set((s) => ({
      savedViews: s.savedViews.map((v) => (v.id === id ? json.saved_view : v)),
      savedViewCountsFetchedAt: null,
    }));
  },
  deleteView: async (id) => {
    const res = await fetch(`/api/saved-views/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok && res.status !== 204) {
      console.error('[store.deleteView]', await res.text());
      return;
    }
    set((s) => {
      const { [id]: _removed, ...rest } = s.savedViewCounts;
      return {
        savedViews: s.savedViews.filter((v) => v.id !== id),
        savedViewCounts: rest,
        savedViewCountsFetchedAt: null,
      };
    });
  },

  // ---- Saved-view status counts (Feature 06) ------------------------------
  savedViewCounts: {},
  savedViewCountsFetchedAt: null,
  fetchSavedViewCounts: async () => {
    const { userId, savedViewCountsFetchedAt } = get();
    if (!userId) return;
    if (
      savedViewCountsFetchedAt !== null &&
      Date.now() - savedViewCountsFetchedAt < 60_000
    ) {
      return;
    }
    const { data, error } = await supabase().rpc('get_saved_view_counts', {
      p_user_id: userId,
    });
    if (error) {
      console.error('[store.fetchSavedViewCounts]', error);
      return;
    }
    const rows = (data ?? []) as Array<{
      view_id: string;
      todo: number;
      in_progress: number;
      done: number;
    }>;
    const next: Record<string, { todo: number; in_progress: number; done: number }> = {};
    for (const r of rows) {
      next[r.view_id] = { todo: r.todo, in_progress: r.in_progress, done: r.done };
    }
    set({ savedViewCounts: next, savedViewCountsFetchedAt: Date.now() });
  },

  notifications: [],
  prefs: null,
  rules: [],
  notifUnsubscribe: null,

  setView: (view) => set({ view }),
  setUserId: (userId) => set({ userId }),

  fetchAll: async () => {
    set({ loading: true });
    // allSettled so one failing fetcher (e.g. categories before its migration
    // runs) doesn't prevent tasks / tags / prefs from loading. Failures are
    // logged so the underlying issue is still visible in devtools.
    const results = await Promise.allSettled([
      get().fetchTags(),
      get().fetchCategories(),
      get().fetchProjects(),
      get().fetchTasks(),
      get().fetchNotifications(),
      get().fetchPrefs(),
      get().fetchRules(),
      get().fetchProfileV2(),
      get().fetchActiveSessions(),
      get().fetchSavedViews(),
      get().fetchDailyTargets(),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') console.error('[store.fetchAll]', r.reason);
    }
    set({ loading: false });
    get().subscribeNotifications();
  },

  fetchNotifications: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    set({ notifications: (data ?? []) as NotificationType[] });
  },

  subscribeNotifications: () => {
    const { userId, notifUnsubscribe } = get();
    if (!userId) return;
    // Idempotent: tear down any prior channel before creating a new one.
    // Supabase Realtime v2 rejects attaching handlers to an already-subscribed
    // channel (StrictMode double-invokes or auth listener re-fires can trigger).
    if (notifUnsubscribe) {
      notifUnsubscribe();
      set({ notifUnsubscribe: null });
    }
    const channel = supabase()
      .channel(`notifications:${userId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: { new: NotificationType }) => {
          const n = payload.new;
          set((s) => ({ notifications: [n, ...s.notifications] }));
        },
      )
      .subscribe();
    set({
      notifUnsubscribe: () => {
        supabase().removeChannel(channel);
      },
    });
  },

  unsubscribeNotifications: () => {
    const { notifUnsubscribe } = get();
    if (notifUnsubscribe) {
      notifUnsubscribe();
      set({ notifUnsubscribe: null });
    }
  },

  markNotificationRead: async (id) => {
    const prev = get().notifications;
    const now = new Date().toISOString();
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id && !n.read_at ? { ...n, read_at: now } : n,
      ),
    }));
    const { error } = await supabase()
      .from('notifications')
      .update({ read_at: now })
      .eq('id', id);
    if (error) {
      set({ notifications: prev });
      throw error;
    }
  },

  markAllNotificationsRead: async () => {
    const { userId } = get();
    if (!userId) return;
    const prev = get().notifications;
    const now = new Date().toISOString();
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.read_at ? n : { ...n, read_at: now },
      ),
    }));
    const { error } = await supabase()
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) {
      set({ notifications: prev });
      throw error;
    }
  },

  fetchPrefs: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const prefs = data as UserPrefs;
      set({ prefs });
      // Feature 09 — seed scheduleSubView from the server-side default the
      // first time prefs load this session. We only seed when local state is
      // still the un-touched default ('day'); if the user (or a rehydrated
      // localStorage value) already changed sub-tab on this device, the
      // existing value wins.
      const persisted = get().scheduleSubView;
      if (
        persisted === 'day' &&
        prefs.schedule_default_subview &&
        prefs.schedule_default_subview !== 'day'
      ) {
        set({ scheduleSubView: prefs.schedule_default_subview });
      }
      // Phase 1.1 — first-load seed only. The persisted local value (if any)
      // wins on subsequent renders; we only seed when the stored value is the
      // initial-state default (false) AND the user actually prefers default-on.
      // The "first load" check is approximate; a brand-new browser will pick
      // up the user's pref on first sign-in.
      const persistedShowCompleted = get().showCompleted;
      if (
        persistedShowCompleted === false &&
        prefs.hide_completed_default === false
      ) {
        set({ showCompleted: true });
      }
    }
  },

  updatePrefs: async (updates) => {
    const { userId, prefs } = get();
    if (!userId || !prefs) return;
    const next = { ...prefs, ...updates };
    set({ prefs: next });
    const { error } = await supabase()
      .from('user_preferences')
      .update(updates)
      .eq('user_id', userId);
    if (error) {
      set({ prefs });
      throw error;
    }
  },

  fetchRules: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('automation_rules')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    set({ rules: (data ?? []) as AutomationRule[] });
  },

  toggleRule: async (ruleKey, isEnabled) => {
    const { userId, rules } = get();
    if (!userId) return;
    set({
      rules: rules.map((r) =>
        r.rule_key === ruleKey ? { ...r, is_enabled: isEnabled } : r,
      ),
    });
    const { error } = await supabase()
      .from('automation_rules')
      .update({ is_enabled: isEnabled })
      .eq('user_id', userId)
      .eq('rule_key', ruleKey);
    if (error) {
      set({ rules });
      throw error;
    }
  },

  // ---- v2 — plan vs reality ------------------------------------------------
  profileV2: null,
  activeSessions: [],
  activeColumn: 'in_progress',
  lastStopSummary: null,
  focusSessionId: null,

  fetchProfileV2: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (data) set({ profileV2: data as UserProfileV2 });
  },

  updateRolloverPromptDate: async (dateISO) => {
    const { userId, profileV2 } = get();
    if (!userId) return;
    if (profileV2) {
      set({ profileV2: { ...profileV2, last_rollover_prompt_date: dateISO } });
    }
    await supabase()
      .from('user_profiles')
      .update({ last_rollover_prompt_date: dateISO })
      .eq('user_id', userId);
  },

  setPlannedForDateBulk: async (updates) => {
    if (updates.length === 0) return;
    const prev = get().tasks;
    // Optimistic local patch.
    const byId = new Map(updates.map((u) => [u.id, u.planned_for_date]));
    set((s) => ({
      tasks: s.tasks.map((t) =>
        byId.has(t.id) ? { ...t, planned_for_date: byId.get(t.id) ?? null } : t,
      ),
    }));
    const db = supabase();
    const results = await Promise.all(
      updates.map((u) =>
        db
          .from('tasks')
          .update({ planned_for_date: u.planned_for_date })
          .eq('id', u.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      set({ tasks: prev });
      throw failed.error;
    }
  },

  // Phase 2 — rewrite today_sequence to 1..N in the given order. The Today
  // view fires this on every drop. We optimistically renumber locally first so
  // the row order is stable across the in-flight DB writes.
  reorderToday: async (date, orderedTaskIds) => {
    if (orderedTaskIds.length === 0) return;
    const prev = get().tasks;
    const seqById = new Map<string, number>(
      orderedTaskIds.map((id, i) => [id, i + 1]),
    );
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.planned_for_date === date && seqById.has(t.id)
          ? { ...t, today_sequence: seqById.get(t.id) ?? null }
          : t,
      ),
    }));
    const db = supabase();
    const results = await Promise.all(
      orderedTaskIds.map((id, i) =>
        db
          .from('tasks')
          .update({ today_sequence: i + 1 })
          .eq('id', id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      set({ tasks: prev });
      throw failed.error;
    }
  },

  // Phase 3 — move a task to a Matrix quadrant. Optimistic local update +
  // single-row PATCH. No-op when the quadrant is already current to avoid a
  // pointless write when DnD ends on the same drop zone the drag started in.
  setMatrixQuadrant: async (taskId, quadrant) => {
    const prev = get().tasks;
    const cur = prev.find((t) => t.id === taskId);
    if (!cur || cur.matrix_quadrant === quadrant) return;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, matrix_quadrant: quadrant } : t,
      ),
    }));
    const { error } = await supabase()
      .from('tasks')
      .update({ matrix_quadrant: quadrant })
      .eq('id', taskId);
    if (error) {
      set({ tasks: prev });
      throw error;
    }
  },

  // Phase 2 — append a task to a day's sequenced set. If the task is already
  // assigned to that date this becomes a no-op for membership; we still bump
  // its today_sequence to the bottom so a fresh add lands at the end of the
  // list rather than wherever it was before.
  addTaskToToday: async (taskId, date) => {
    const { tasks } = get();
    const onDay = tasks.filter((t) => t.planned_for_date === date);
    const maxSeq = onDay.reduce(
      (m, t) => Math.max(m, t.today_sequence ?? 0),
      0,
    );
    const nextSeq = maxSeq + 1;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, planned_for_date: date, today_sequence: nextSeq }
          : t,
      ),
    }));
    const { error } = await supabase()
      .from('tasks')
      .update({ planned_for_date: date, today_sequence: nextSeq })
      .eq('id', taskId);
    if (error) {
      // Re-fetch on failure so the UI doesn't drift; throwing would interrupt
      // the picker flow which is annoying for the user.
      void get().fetchTasks();
      throw error;
    }
  },

  // New-spec-1 Feature 4 — load ALL active timers, not just the most recent.
  fetchActiveSessions: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('tracked_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('started_at', { ascending: true });
    if (error) throw error;
    set({ activeSessions: (data ?? []) as TrackedSession[] });
  },

  setActiveColumn: (col) => set({ activeColumn: col }),

  // Starts a new timer WITHOUT stopping any existing ones (Feature 4).
  // If a timer for this exact (task_id, subtask_id) pair is already running,
  // it's returned as-is — double-clicking the play icon is idempotent.
  startTrackingTask: async (
    taskId,
    subtaskId = null,
    mode = 'open',
    plannedDurationSeconds = null,
  ) => {
    const { userId, activeSessions } = get();
    if (!userId) return null;
    const existing = activeSessions.find(
      (s) => s.task_id === taskId && s.subtask_id === (subtaskId ?? null),
    );
    if (existing) return existing;
    const { data, error } = await supabase()
      .from('tracked_sessions')
      .insert({
        user_id: userId,
        task_id: taskId,
        subtask_id: subtaskId,
        started_at: new Date().toISOString(),
        mode,
        planned_duration_seconds: plannedDurationSeconds,
      })
      .select()
      .single();
    if (error) throw error;
    const row = data as TrackedSession;
    set((s) => ({ activeSessions: [...s.activeSessions, row] }));

    // Phase 1.2 — stamp last_progress_at so the "not recording time" warning
    // disappears immediately on this card. Fire-and-forget; the warning state
    // is purely UI signal and a missed write means the next session save will
    // refresh it.
    const nowISO = new Date().toISOString();
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, last_progress_at: nowISO } : t,
      ),
    }));
    void supabase().from('tasks').update({ last_progress_at: nowISO }).eq('id', taskId);

    // Auto-promote todo → in_progress when work actively starts. The view
    // (v_task_status) already sees this as in_progress because the open
    // session promotes it; this block keeps legacy `tasks.status` in sync and
    // also flips effective_status optimistically so the UI updates without a
    // refetch round-trip. Mirrors mobile's branch in get-it-done-mobile/lib/store.ts.
    const parent = get().tasks.find((t) => t.id === taskId);
    if (parent && parent.effective_status === 'todo') {
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? { ...t, status: 'in_progress', effective_status: 'in_progress' }
            : t,
        ),
      }));
      const { error: promoteErr } = await supabase()
        .from('tasks')
        .update({ status: 'in_progress' })
        .eq('id', taskId);
      if (promoteErr) {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: 'todo', effective_status: 'todo' }
              : t,
          ),
        }));
      }
    }

    return row;
  },

  stopSession: async (sessionId) => {
    const { activeSessions } = get();
    const sess = activeSessions.find((s) => s.id === sessionId);
    if (!sess) return;
    const now = new Date();
    // Feature 05 — fold any in-progress break into break_seconds before
    // computing the final tracked duration. duration_seconds is always net of
    // break time so insights/streaks don't need to know about breaks.
    const liveBreak =
      sess.is_on_break && sess.last_break_started_at
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() -
                new Date(sess.last_break_started_at).getTime()) /
                1000,
            ),
          )
        : 0;
    const breakTotal = (sess.break_seconds ?? 0) + liveBreak;
    const elapsed = Math.max(
      0,
      Math.floor((now.getTime() - new Date(sess.started_at).getTime()) / 1000),
    );
    const dur = Math.max(0, elapsed - breakTotal);
    const { error } = await supabase()
      .from('tracked_sessions')
      .update({
        ended_at: now.toISOString(),
        duration_seconds: dur,
        break_seconds: breakTotal,
        is_on_break: false,
        last_break_started_at: null,
      })
      .eq('id', sessionId);
    if (error) throw error;
    // Roll the just-finished session's duration into the local task / subtask
    // tracked_total_seconds so the "time invested" chip updates immediately.
    // Also stamp last_progress_at so the "no time logged" warning clears.
    const nowISO = now.toISOString();
    const taskId = sess.task_id;
    const subtaskId = sess.subtask_id;
    set((s) => ({
      activeSessions: s.activeSessions.filter((x) => x.id !== sessionId),
      lastStopSummary: { durationSeconds: dur, at: Date.now() },
      focusSessionId: s.focusSessionId === sessionId ? null : s.focusSessionId,
      tasks: taskId
        ? s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  tracked_total_seconds: t.tracked_total_seconds + dur,
                  last_progress_at: nowISO,
                  subtasks: subtaskId
                    ? t.subtasks.map((sub) =>
                        sub.id === subtaskId
                          ? { ...sub, tracked_total_seconds: sub.tracked_total_seconds + dur }
                          : sub,
                      )
                    : t.subtasks,
                }
              : t,
          )
        : s.tasks,
    }));
    if (taskId) {
      void supabase().from('tasks').update({ last_progress_at: nowISO }).eq('id', taskId);
    }
  },

  // Focus Lock — planned duration hit zero. Stops the session and re-pulls
  // the profile so the streak (bumped by the SQL trigger) reflects the new count.
  completeSession: async (sessionId) => {
    await get().stopSession(sessionId);
    await get().fetchProfileV2();
  },

  // Focus Lock — user exited a Strict session early. Writes broken=true +
  // reason, ends the session. A DB trigger resets the streak to 0; re-fetch
  // profileV2 so the UI reflects that immediately.
  markSessionBroken: async (sessionId, reason) => {
    const { activeSessions } = get();
    const sess = activeSessions.find((s) => s.id === sessionId);
    if (!sess) return;
    const now = new Date();
    const liveBreak =
      sess.is_on_break && sess.last_break_started_at
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() -
                new Date(sess.last_break_started_at).getTime()) /
                1000,
            ),
          )
        : 0;
    const breakTotal = (sess.break_seconds ?? 0) + liveBreak;
    const elapsed = Math.max(
      0,
      Math.floor((now.getTime() - new Date(sess.started_at).getTime()) / 1000),
    );
    const dur = Math.max(0, elapsed - breakTotal);
    const { error } = await supabase()
      .from('tracked_sessions')
      .update({
        ended_at: now.toISOString(),
        duration_seconds: dur,
        broken: true,
        broken_reason: reason,
        break_seconds: breakTotal,
        is_on_break: false,
        last_break_started_at: null,
      })
      .eq('id', sessionId);
    if (error) throw error;
    // Same optimistic rollup as stopSession — a broken session still recorded
    // real time and the chip should show it.
    const nowISO_b = now.toISOString();
    const taskId_b = sess.task_id;
    const subtaskId_b = sess.subtask_id;
    set((s) => ({
      activeSessions: s.activeSessions.filter((x) => x.id !== sessionId),
      lastStopSummary: { durationSeconds: dur, at: Date.now() },
      focusSessionId: s.focusSessionId === sessionId ? null : s.focusSessionId,
      tasks: taskId_b
        ? s.tasks.map((t) =>
            t.id === taskId_b
              ? {
                  ...t,
                  tracked_total_seconds: t.tracked_total_seconds + dur,
                  last_progress_at: nowISO_b,
                  subtasks: subtaskId_b
                    ? t.subtasks.map((sub) =>
                        sub.id === subtaskId_b
                          ? { ...sub, tracked_total_seconds: sub.tracked_total_seconds + dur }
                          : sub,
                      )
                    : t.subtasks,
                }
              : t,
          )
        : s.tasks,
    }));
    if (taskId_b) {
      void supabase().from('tasks').update({ last_progress_at: nowISO_b }).eq('id', taskId_b);
    }
    await get().fetchProfileV2();
  },

  // Legacy: Pause is modeled as stop + was_paused=true; resume creates a new
  // row. Replaced in the UI by Break (Feature 05) but kept callable so other
  // call sites don't break. Now also nets out break time before writing.
  pauseSession: async (sessionId) => {
    const { activeSessions } = get();
    const sess = activeSessions.find((s) => s.id === sessionId);
    if (!sess) return;
    const now = new Date();
    const liveBreak =
      sess.is_on_break && sess.last_break_started_at
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() -
                new Date(sess.last_break_started_at).getTime()) /
                1000,
            ),
          )
        : 0;
    const breakTotal = (sess.break_seconds ?? 0) + liveBreak;
    const elapsed = Math.max(
      0,
      Math.floor((now.getTime() - new Date(sess.started_at).getTime()) / 1000),
    );
    const dur = Math.max(0, elapsed - breakTotal);
    const { error } = await supabase()
      .from('tracked_sessions')
      .update({
        ended_at: now.toISOString(),
        duration_seconds: dur,
        was_paused: true,
        break_seconds: breakTotal,
        is_on_break: false,
        last_break_started_at: null,
      })
      .eq('id', sessionId);
    if (error) throw error;
    // Pause is a stop in disguise — fold the duration into the chip rollup.
    const nowISO_p = now.toISOString();
    const taskId_p = sess.task_id;
    const subtaskId_p = sess.subtask_id;
    set((s) => ({
      activeSessions: s.activeSessions.filter((x) => x.id !== sessionId),
      focusSessionId: s.focusSessionId === sessionId ? null : s.focusSessionId,
      tasks: taskId_p
        ? s.tasks.map((t) =>
            t.id === taskId_p
              ? {
                  ...t,
                  tracked_total_seconds: t.tracked_total_seconds + dur,
                  last_progress_at: nowISO_p,
                  subtasks: subtaskId_p
                    ? t.subtasks.map((sub) =>
                        sub.id === subtaskId_p
                          ? { ...sub, tracked_total_seconds: sub.tracked_total_seconds + dur }
                          : sub,
                      )
                    : t.subtasks,
                }
              : t,
          )
        : s.tasks,
    }));
    if (taskId_p) {
      void supabase().from('tasks').update({ last_progress_at: nowISO_p }).eq('id', taskId_p);
    }
  },

  // Feature 05 — Break button. Within a single session row, toggle into a
  // "stepped away" state: tracked seconds freeze, a separate break counter
  // accrues. Resume folds the live break delta into break_seconds. The session
  // row stays in activeSessions throughout — only is_on_break flips.
  //
  // duration_seconds is also flushed here (net of break_seconds so far) so the
  // periodic 30s persist + a refresh mid-break show the correct frozen value.
  startBreak: async (sessionId) => {
    const { activeSessions } = get();
    const sess = activeSessions.find((s) => s.id === sessionId);
    if (!sess) return;
    if (sess.is_on_break) return;
    const now = new Date();
    const elapsed = Math.max(
      0,
      Math.floor((now.getTime() - new Date(sess.started_at).getTime()) / 1000),
    );
    const dur = Math.max(0, elapsed - (sess.break_seconds ?? 0));
    const updates = {
      is_on_break: true,
      last_break_started_at: now.toISOString(),
      duration_seconds: dur,
    };
    set((s) => ({
      activeSessions: s.activeSessions.map((x) =>
        x.id === sessionId ? { ...x, ...updates } : x,
      ),
    }));
    const { error } = await supabase()
      .from('tracked_sessions')
      .update(updates)
      .eq('id', sessionId);
    if (error) throw error;
  },

  endBreak: async (sessionId) => {
    const { activeSessions } = get();
    const sess = activeSessions.find((s) => s.id === sessionId);
    if (!sess) return;
    if (!sess.is_on_break || !sess.last_break_started_at) return;
    const now = new Date();
    const delta = Math.max(
      0,
      Math.floor(
        (now.getTime() - new Date(sess.last_break_started_at).getTime()) / 1000,
      ),
    );
    const newBreakTotal = (sess.break_seconds ?? 0) + delta;
    const updates = {
      is_on_break: false,
      last_break_started_at: null,
      break_seconds: newBreakTotal,
    };
    set((s) => ({
      activeSessions: s.activeSessions.map((x) =>
        x.id === sessionId ? { ...x, ...updates } : x,
      ),
    }));
    const { error } = await supabase()
      .from('tracked_sessions')
      .update(updates)
      .eq('id', sessionId);
    if (error) throw error;
  },

  // Manually edit a session's start/end window. Used by the Timeline "Adjust"
  // popover so users can trim an abandoned timer that painted too much time.
  // Recomputes duration_seconds from the new window, net of any break_seconds
  // already accrued on the row. Phase 4 — also writes manually_entered=true
  // by default plus optional break_label / note / block_type changes.
  updateSessionTimes: async (sessionId, startedAtISO, endedAtISO, opts) => {
    const startMs = new Date(startedAtISO).getTime();
    const endMs = new Date(endedAtISO).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error('Invalid session window');
    }
    const window = Math.floor((endMs - startMs) / 1000);
    const { activeSessions } = get();
    const sess = activeSessions.find((s) => s.id === sessionId);
    const breakTotal = sess?.break_seconds ?? 0;
    const dur = Math.max(0, window - breakTotal);
    const payload: Record<string, unknown> = {
      started_at: startedAtISO,
      ended_at: endedAtISO,
      duration_seconds: dur,
      // Default to true: any explicit call to updateSessionTimes is, by
      // definition, the user touching the row after the fact.
      manually_entered: opts?.manuallyEntered ?? true,
    };
    if (opts?.blockType !== undefined) payload.block_type = opts.blockType;
    if (opts?.breakLabel !== undefined) payload.break_label = opts.breakLabel;
    if (opts?.breakAutoDetected !== undefined)
      payload.break_auto_detected = opts.breakAutoDetected;
    if (opts?.note !== undefined) payload.note = opts.note;
    const { error } = await supabase()
      .from('tracked_sessions')
      .update(payload)
      .eq('id', sessionId);
    if (error) throw error;
    set((s) => ({
      activeSessions: s.activeSessions.filter((x) => x.id !== sessionId),
    }));
    // Refetch so the "time invested" chip reflects the edited duration. The
    // closed tracked_sessions sum is computed at fetchTasks time, so an
    // in-place edit can't be optimistic without redoing the math here.
    await get().fetchTasks();
  },

  addSession: async (taskId, startedAtISO, endedAtISO, opts) => {
    const startMs = new Date(startedAtISO).getTime();
    const endMs = new Date(endedAtISO).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error('Invalid session window');
    }
    const { userId } = get();
    if (!userId) throw new Error('Not signed in');
    const dur = Math.floor((endMs - startMs) / 1000);
    const { error } = await supabase()
      .from('tracked_sessions')
      .insert({
        user_id: userId,
        task_id: taskId,
        subtask_id: null,
        planned_block_id: null,
        started_at: startedAtISO,
        ended_at: endedAtISO,
        duration_seconds: dur,
        mode: 'open',
        was_paused: false,
        drift_events: [],
        broken: false,
        broken_reason: null,
        planned_duration_seconds: null,
        break_seconds: 0,
        is_on_break: false,
        last_break_started_at: null,
        // Phase 4 — audit flag + optional break metadata.
        manually_entered: opts?.manuallyEntered ?? true,
        block_type: opts?.blockType ?? 'tracked',
        break_label: opts?.breakLabel ?? null,
        break_auto_detected: opts?.breakAutoDetected ?? false,
        note: opts?.note ?? null,
      });
    if (error) throw error;
    await get().fetchTasks();
  },

  deleteSession: async (sessionId) => {
    const { error } = await supabase()
      .from('tracked_sessions')
      .delete()
      .eq('id', sessionId);
    if (error) throw error;
    set((s) => ({
      activeSessions: s.activeSessions.filter((x) => x.id !== sessionId),
      focusSessionId: s.focusSessionId === sessionId ? null : s.focusSessionId,
    }));
    await get().fetchTasks();
  },

  // Called every 30s by useLiveTimer so a browser crash doesn't lose progress.
  // duration_seconds is always written net-of-break: closed break_seconds plus
  // (if currently on break) the live break delta is subtracted from elapsed.
  persistActiveSessionDurations: async () => {
    const { activeSessions } = get();
    if (activeSessions.length === 0) return;
    const db = supabase();
    const now = Date.now();
    await Promise.all(
      activeSessions.map((s) => {
        const elapsed = Math.max(
          0,
          Math.floor((now - new Date(s.started_at).getTime()) / 1000),
        );
        const liveBreak =
          s.is_on_break && s.last_break_started_at
            ? Math.max(
                0,
                Math.floor(
                  (now - new Date(s.last_break_started_at).getTime()) / 1000,
                ),
              )
            : 0;
        const breakTotal = (s.break_seconds ?? 0) + liveBreak;
        const dur = Math.max(0, elapsed - breakTotal);
        return db
          .from('tracked_sessions')
          .update({ duration_seconds: dur })
          .eq('id', s.id);
      }),
    );
  },

  appendDriftEvent: async (sessionId, drift) => {
    const { activeSessions } = get();
    const sess = activeSessions.find((s) => s.id === sessionId);
    if (!sess) return;
    const nextDrifts = [...(sess.drift_events ?? []), drift];
    set((s) => ({
      activeSessions: s.activeSessions.map((x) =>
        x.id === sessionId ? { ...x, drift_events: nextDrifts } : x,
      ),
    }));
    await supabase()
      .from('tracked_sessions')
      .update({ drift_events: nextDrifts })
      .eq('id', sessionId);
  },

  updateSessionMode: async (sessionId, mode) => {
    set((s) => ({
      activeSessions: s.activeSessions.map((x) =>
        x.id === sessionId ? { ...x, mode } : x,
      ),
    }));
    await supabase()
      .from('tracked_sessions')
      .update({ mode })
      .eq('id', sessionId);
  },

  openFocusMode: (sessionId) => set({ focusSessionId: sessionId }),
  closeFocusMode: () => set({ focusSessionId: null }),

  focusLockPicker: null,
  openFocusLockPicker: (taskId, subtaskId = null) =>
    set({ focusLockPicker: { taskId, subtaskId } }),
  closeFocusLockPicker: () => set({ focusLockPicker: null }),

  clearStopSummary: () => set({ lastStopSummary: null }),

  plannedBlocks: [],

  recurringTemplates: [],

  fetchRecurringTemplates: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('recurring_templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    set({ recurringTemplates: (data ?? []) as RecurringTemplate[] });
  },

  addRecurringTemplate: async (input) => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('recurring_templates')
      .insert({ ...input, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    set((s) => ({
      recurringTemplates: [data as RecurringTemplate, ...s.recurringTemplates],
    }));
  },

  updateRecurringTemplate: async (id, updates) => {
    const prev = get().recurringTemplates;
    set((s) => ({
      recurringTemplates: s.recurringTemplates.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      ),
    }));
    const { error } = await supabase()
      .from('recurring_templates')
      .update(updates)
      .eq('id', id);
    if (error) {
      set({ recurringTemplates: prev });
      throw error;
    }
  },

  deleteRecurringTemplate: async (id) => {
    const prev = get().recurringTemplates;
    set((s) => ({
      recurringTemplates: s.recurringTemplates.filter((t) => t.id !== id),
    }));
    const { error } = await supabase()
      .from('recurring_templates')
      .delete()
      .eq('id', id);
    if (error) {
      set({ recurringTemplates: prev });
      throw error;
    }
  },

  toggleRecurringTemplate: async (id, isEnabled) => {
    await get().updateRecurringTemplate(id, { is_enabled: isEnabled });
  },

  fetchPlannedBlocks: async (fromISO, toISO) => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('planned_blocks')
      .select('*')
      .eq('user_id', userId)
      .gte('start_at', fromISO)
      .lt('start_at', toISO)
      .order('start_at', { ascending: true });
    if (error) throw error;
    set({ plannedBlocks: (data ?? []) as PlannedBlock[] });
  },

  addPlannedBlock: async (input) => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('planned_blocks')
      .insert({ ...input, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    set((s) => ({
      plannedBlocks: [...s.plannedBlocks, data as PlannedBlock].sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      ),
    }));
  },

  updatePlannedBlock: async (id, updates) => {
    const prev = get().plannedBlocks;
    set((s) => ({
      plannedBlocks: s.plannedBlocks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    }));
    const { error } = await supabase()
      .from('planned_blocks')
      .update(updates)
      .eq('id', id);
    if (error) {
      set({ plannedBlocks: prev });
      throw error;
    }
  },

  deletePlannedBlock: async (id) => {
    const prev = get().plannedBlocks;
    set((s) => ({ plannedBlocks: s.plannedBlocks.filter((b) => b.id !== id) }));
    const { error } = await supabase().from('planned_blocks').delete().eq('id', id);
    if (error) {
      set({ plannedBlocks: prev });
      throw error;
    }
  },

  fetchTags: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('tags')
      .select('id, name, color')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    set({ tags: (data ?? []) as TagType[] });
  },

  fetchTasks: async () => {
    const { userId } = get();
    if (!userId) return;
    // Two parallel queries: tasks (with embeds) and v_task_status (read-only
    // derived view from migration 0023). Merged in JS by id. v_task_status is
    // a view, so PostgREST can't embed it as a relationship without an FK
    // hint that views don't support.
    const [tasksRes, statusRes] = await Promise.all([
      supabase()
        .from('tasks')
        .select(
          `
          id, user_id, title, description, status, completed_at, priority, due_date,
          total_time_seconds, estimated_seconds, sort_order, allow_alarms,
          planned_for_date, today_sequence, matrix_quadrant, last_progress_at,
          subtasks ( id, task_id, title, is_done, total_time_seconds, sort_order ),
          task_tags ( tag_id ),
          task_categories ( category_id ),
          task_projects ( project_id ),
          time_sessions ( id, task_id, subtask_id, started_at, duration_seconds, label ),
          tracked_sessions ( subtask_id, duration_seconds, ended_at )
        `,
        )
        .eq('user_id', userId)
        .order('sort_order', { ascending: true }),
      supabase()
        .from('v_task_status')
        .select('id, effective_status')
        .eq('user_id', userId),
    ]);
    if (tasksRes.error) throw tasksRes.error;
    if (statusRes.error) throw statusRes.error;
    const statusRows = (statusRes.data ?? []) as { id: string; effective_status: Status }[];
    const statusMap = new Map<string, Status>(
      statusRows.map((r) => [r.id, r.effective_status]),
    );
    const rows = (tasksRes.data ?? []) as unknown as TaskRow[];
    const tasks = rows.map((row) =>
      rowToTask(row, statusMap.get(row.id) ?? row.status),
    );

    set({ tasks });
  },

  addTask: async (input) => {
    const { userId } = get();
    if (!userId) return null;
    const { data, error } = await supabase()
      .from('tasks')
      .insert({
        user_id: userId,
        title: input.title,
        priority: input.priority,
        status: input.status,
        due_date: input.due_date || null,
        estimated_seconds: input.estimated_seconds ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    const task = data as TaskRow;
    const categoryIds = input.category_ids ?? [];
    const projectIds = input.project_ids ?? [];
    if (input.tag_ids.length > 0) {
      const { error: tagErr } = await supabase()
        .from('task_tags')
        .insert(input.tag_ids.map((tag_id) => ({ task_id: task.id, tag_id })));
      if (tagErr) throw tagErr;
    }
    if (categoryIds.length > 0) {
      const { error: catErr } = await supabase()
        .from('task_categories')
        .insert(categoryIds.map((category_id) => ({ task_id: task.id, category_id })));
      if (catErr) throw catErr;
    }
    if (projectIds.length > 0) {
      const { error: projErr } = await supabase()
        .from('task_projects')
        .insert(projectIds.map((project_id) => ({ task_id: task.id, project_id })));
      if (projErr) throw projErr;
    }
    const newTask: TaskType = {
      ...rowToTask({
        ...task,
        description: task.description ?? null,
        completed_at: task.completed_at ?? null,
        allow_alarms: task.allow_alarms ?? false,
        planned_for_date: task.planned_for_date ?? null,
        subtasks: [],
        task_tags: [],
        task_categories: [],
        task_projects: [],
        time_sessions: [],
        tracked_sessions: [],
      // A fresh task has no tracked_sessions and no completed_at, so
      // v_task_status will derive 'todo'. Hardcode the local seed to match
      // the spec invariant (no flicker through 'in_progress' or 'done').
      }, 'todo'),
      tag_ids: input.tag_ids,
      category_ids: categoryIds,
      project_ids: projectIds,
    };
    set((s) => ({
      tasks: [...s.tasks, newTask],
      savedViewCountsFetchedAt: null,
    }));
    return task.id;
  },

  updateTask: async (id, updates) => {
    const prev = get().tasks;
    const before = prev.find((t) => t.id === id);
    // Phase 1.3 — edits reset task to To Do (configurable).
    // Trigger fields (per upgrade brief): title, estimated_seconds, project,
    // subtasks. project/subtask changes happen via separate store actions
    // (updateTaskProjects / addSubtask / etc); those call sites trigger the
    // reset directly via `applyEditReset`. Here we only check the in-row fields.
    const triggerFields = (get().prefs?.edit_reset_fields ?? [
      'title',
      'estimate',
      'project',
      'subtasks',
    ]) as string[];
    const editResetsEnabled = get().prefs?.edit_resets_status ?? true;
    const titleChanged =
      updates.title !== undefined && before && updates.title !== before.title;
    const estimateChanged =
      updates.estimated_seconds !== undefined &&
      before &&
      (updates.estimated_seconds ?? null) !== (before.estimated_seconds ?? null);
    const shouldReset =
      editResetsEnabled &&
      before &&
      before.effective_status === 'in_progress' &&
      ((titleChanged && triggerFields.includes('title')) ||
        (estimateChanged && triggerFields.includes('estimate')));

    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const merged = { ...t, ...updates };
        // Re-derive effective_status locally to mirror v_task_status. The next
        // fetchTasks reconfirms; this prevents flicker between click and refetch.
        // Especially critical for Done-checkbox toggles where the user expects
        // immediate visual feedback.
        merged.effective_status = deriveEffectiveStatus(merged);
        // Phase 1.3 — optimistically demote to todo. v_task_status still sees
        // logged sessions and will return 'in_progress' on next refetch; the
        // store relies on the legacy `tasks.status` write to keep the demotion
        // visible after refetch (rowToTask falls back to row.status when
        // v_task_status has no row for this id — see fetchTasks).
        if (shouldReset) merged.effective_status = 'todo';
        return merged;
      }),
    }));
    const payload: Record<string, unknown> = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.priority !== undefined) payload.priority = updates.priority;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.completed_at !== undefined) payload.completed_at = updates.completed_at;
    if (updates.due_date !== undefined) payload.due_date = updates.due_date;
    if (updates.estimated_seconds !== undefined)
      payload.estimated_seconds = updates.estimated_seconds;
    if (updates.allow_alarms !== undefined) payload.allow_alarms = updates.allow_alarms;
    if (updates.planned_for_date !== undefined)
      payload.planned_for_date = updates.planned_for_date;
    if (updates.today_sequence !== undefined)
      payload.today_sequence = updates.today_sequence;
    if (updates.matrix_quadrant !== undefined)
      payload.matrix_quadrant = updates.matrix_quadrant;
    if (updates.last_progress_at !== undefined)
      payload.last_progress_at = updates.last_progress_at;
    if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;
    if (shouldReset) payload.status = 'todo';
    // Phase 1.2 — any edit is "real progress" except for the reset itself
    // (which is the user un-doing momentum, not adding it). Don't stamp on
    // a no-op call.
    if (Object.keys(payload).length === 0) return;
    if (!shouldReset && before && (titleChanged || estimateChanged))
      payload.last_progress_at = new Date().toISOString();
    const { error } = await supabase().from('tasks').update(payload).eq('id', id);
    if (error) {
      set({ tasks: prev });
      throw error;
    }
    if (shouldReset && before) {
      // Show an undo toast that flips the task back. 8 s window per brief.
      get().showResetUndoToast(id, before.status);
    }
    set({ savedViewCountsFetchedAt: null });
  },

  // Phase 1.3 — undo handler for the "Moved to To Do — undo" toast.
  showResetUndoToast: (taskId, previousStatus) => {
    const id = (get().toast?.id ?? 0) + 1;
    set({
      toast: { message: 'Moved to To Do — undo', id, action: { kind: 'edit_reset_undo', taskId, previousStatus } },
    });
    setTimeout(() => {
      // Self-dismiss if no newer toast superseded this one.
      const cur = get().toast;
      if (cur && cur.id === id) set({ toast: null });
    }, 8000);
  },
  undoEditReset: async (taskId, previousStatus) => {
    // Flip optimistically + write back to DB. effective_status re-derives from
    // sessions, so as long as the task still has logged time, the UI returns
    // to 'in_progress' instantly.
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const merged = { ...t, status: previousStatus };
        merged.effective_status = deriveEffectiveStatus(merged);
        return merged;
      }),
      toast: null,
    }));
    await supabase().from('tasks').update({ status: previousStatus }).eq('id', taskId);
  },

  deleteTask: async (id) => {
    const prev = get().tasks;
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    const { error } = await supabase().from('tasks').delete().eq('id', id);
    if (error) {
      set({ tasks: prev });
      throw error;
    }
    set({ savedViewCountsFetchedAt: null });
  },

  moveTask: async (id, status) => {
    await get().updateTask(id, { status });
  },

  addSubtask: async (taskId, title) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;
    const nextOrder = task.subtasks.length;
    const { data, error } = await supabase()
      .from('subtasks')
      .insert({ task_id: taskId, title, sort_order: nextOrder })
      .select()
      .single();
    if (error) throw error;
    const sub: SubtaskType = { ...(data as SubtaskRow), tracked_total_seconds: 0 };
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, subtasks: [...t.subtasks, sub] } : t,
      ),
    }));
  },

  toggleSubtask: async (taskId, subtaskId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    const sub = task?.subtasks.find((s) => s.id === subtaskId);
    if (!task || !sub) return;
    const newDone = !sub.is_done;

    const updatedSubs = task.subtasks.map((s) =>
      s.id === subtaskId ? { ...s, is_done: newDone } : s,
    );
    const allDone = updatedSubs.length > 0 && updatedSubs.every((s) => s.is_done);
    let nextStatus: Status = task.status;
    if (allDone) nextStatus = 'done';
    else if (task.status === 'done') nextStatus = 'in_progress';
    else if (newDone && task.status === 'todo') nextStatus = 'in_progress';

    const prev = get().tasks;
    // Phase 1.2 — toggling a subtask is real progress; reset the warning clock.
    const nowISO = new Date().toISOString();
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, subtasks: updatedSubs, status: nextStatus, last_progress_at: nowISO }
          : t,
      ),
    }));

    const { error } = await supabase()
      .from('subtasks')
      .update({ is_done: newDone })
      .eq('id', subtaskId);
    if (error) {
      set({ tasks: prev });
      throw error;
    }
    const taskUpdates: Record<string, unknown> = { last_progress_at: nowISO };
    if (nextStatus !== task.status) taskUpdates.status = nextStatus;
    const { error: taskErr } = await supabase()
      .from('tasks')
      .update(taskUpdates)
      .eq('id', taskId);
    if (taskErr) {
      set({ tasks: prev });
      throw taskErr;
    }
  },

  renameSubtask: async (taskId, subtaskId, title) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id !== taskId
          ? t
          : {
              ...t,
              subtasks: t.subtasks.map((sub) =>
                sub.id === subtaskId ? { ...sub, title } : sub,
              ),
            },
      ),
    }));
    const { error } = await supabase()
      .from('subtasks')
      .update({ title })
      .eq('id', subtaskId);
    if (error) {
      set({ tasks: prev });
      throw error;
    }
  },

  deleteSubtask: async (taskId, subtaskId) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id !== taskId
          ? t
          : { ...t, subtasks: t.subtasks.filter((sub) => sub.id !== subtaskId) },
      ),
    }));
    const { error } = await supabase().from('subtasks').delete().eq('id', subtaskId);
    if (error) {
      set({ tasks: prev });
      throw error;
    }
  },

  reorderSubtasks: async (taskId, orderedIds) => {
    const prev = get().tasks;
    const task = prev.find((t) => t.id === taskId);
    if (!task) return;
    const byId = new Map(task.subtasks.map((s) => [s.id, s]));
    const next = orderedIds
      .map((id, i) => {
        const s = byId.get(id);
        return s ? { ...s, sort_order: i } : null;
      })
      .filter((s): s is SubtaskType => s !== null);
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: next } : t)),
    }));
    const db = supabase();
    const results = await Promise.all(
      next.map((s) =>
        db.from('subtasks').update({ sort_order: s.sort_order }).eq('id', s.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      set({ tasks: prev });
      throw failed.error;
    }
  },

  saveTimeSession: async (taskId, subtaskId, startedAt, duration, label) => {
    const { error } = await supabase().rpc('save_time_session', {
      p_task_id: taskId,
      p_subtask_id: subtaskId,
      p_started_at: startedAt,
      p_duration: duration,
      p_label: label,
    });
    if (error) throw error;
    const nowISO = new Date().toISOString();
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const newSession: TimeSession = {
          id: crypto.randomUUID(),
          task_id: taskId,
          subtask_id: subtaskId,
          started_at: startedAt,
          duration_seconds: duration,
          label,
        };
        return {
          ...t,
          total_time_seconds: t.total_time_seconds + duration,
          // Phase 1.2 — fresh session means real progress just happened.
          last_progress_at: nowISO,
          sessions: [...t.sessions, newSession],
          subtasks: subtaskId
            ? t.subtasks.map((sub) =>
                sub.id === subtaskId
                  ? { ...sub, total_time_seconds: sub.total_time_seconds + duration }
                  : sub,
              )
            : t.subtasks,
        };
      }),
    }));
    void supabase().from('tasks').update({ last_progress_at: nowISO }).eq('id', taskId);
  },

  addTag: async (name, color) => {
    const { userId } = get();
    if (!userId) return;
    const sortOrder = get().tags.length;
    const { data, error } = await supabase()
      .from('tags')
      .insert({ user_id: userId, name, color, sort_order: sortOrder })
      .select('id, name, color')
      .single();
    if (error) throw error;
    set((s) => ({ tags: [...s.tags, data as TagType] }));
  },

  deleteTag: async (id) => {
    const prev = { tags: get().tags, tasks: get().tasks };
    set((s) => ({
      tags: s.tags.filter((t) => t.id !== id),
      tasks: s.tasks.map((t) => ({
        ...t,
        tag_ids: t.tag_ids.filter((tagId) => tagId !== id),
      })),
    }));
    const { error } = await supabase().from('tags').delete().eq('id', id);
    if (error) {
      set(prev);
      throw error;
    }
  },

  updateTaskTags: async (taskId, tagIds) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, tag_ids: tagIds } : t)),
    }));
    const db = supabase();
    const { error: delErr } = await db.from('task_tags').delete().eq('task_id', taskId);
    if (delErr) {
      set({ tasks: prev });
      throw delErr;
    }
    if (tagIds.length > 0) {
      const { error: insErr } = await db
        .from('task_tags')
        .insert(tagIds.map((tag_id) => ({ task_id: taskId, tag_id })));
      if (insErr) {
        set({ tasks: prev });
        throw insErr;
      }
    }
  },

  // ---- Categories (AGENT1) ------------------------------------------------
  fetchCategories: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('categories')
      .select('id, name, color')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    set({ categories: (data ?? []) as CategoryType[] });
  },

  addCategory: async (name, color) => {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const { category } = (await res.json()) as { category: CategoryType };
    set((s) => ({ categories: [...s.categories, category] }));
    return category;
  },

  updateCategory: async (id, updates) => {
    const prev = get().categories;
    set((s) => ({
      categories: s.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      set({ categories: prev });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
  },

  deleteCategory: async (id) => {
    const prevCats = get().categories;
    const prevTasks = get().tasks;
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== id),
      tasks: s.tasks.map((t) => ({
        ...t,
        category_ids: t.category_ids.filter((x) => x !== id),
      })),
    }));
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      set({ categories: prevCats, tasks: prevTasks });
      throw new Error(`HTTP ${res.status}`);
    }
  },

  attachCategoryToTask: async (taskId, categoryId) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId && !t.category_ids.includes(categoryId)
          ? { ...t, category_ids: [...t.category_ids, categoryId] }
          : t,
      ),
    }));
    const res = await fetch(`/api/tasks/${taskId}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId }),
    });
    if (!res.ok) {
      set({ tasks: prev });
      throw new Error(`HTTP ${res.status}`);
    }
  },

  detachCategoryFromTask: async (taskId, categoryId) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, category_ids: t.category_ids.filter((x) => x !== categoryId) }
          : t,
      ),
    }));
    const res = await fetch(
      `/api/tasks/${taskId}/categories/${categoryId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      set({ tasks: prev });
      throw new Error(`HTTP ${res.status}`);
    }
  },

  // Bulk sync — diffs the target list against current state and fires
  // attach/detach calls in parallel. Used by the edit drawer "Save".
  updateTaskCategories: async (taskId, categoryIds) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;
    const current = new Set(task.category_ids);
    const next = new Set(categoryIds);
    const toAdd = categoryIds.filter((id) => !current.has(id));
    const toRemove = task.category_ids.filter((id) => !next.has(id));
    await Promise.all([
      ...toAdd.map((id) => get().attachCategoryToTask(taskId, id)),
      ...toRemove.map((id) => get().detachCategoryFromTask(taskId, id)),
    ]);
  },

  // ---- Projects (AGENT1) --------------------------------------------------
  fetchProjects: async () => {
    const { userId } = get();
    if (!userId) return;
    // Two parallel queries: projects + staleness flags from v_project_staleness
    // (migration 0033). Merged in JS by id. The view inherits RLS from
    // projects + user_preferences, so the user only sees their own rows.
    const [projRes, staleRes] = await Promise.all([
      supabase()
        .from('projects')
        .select('id, name, color, status, last_activity_at')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true }),
      supabase()
        .from('v_project_staleness')
        .select('project_id, is_stale')
        .eq('user_id', userId),
    ]);
    if (projRes.error) throw projRes.error;
    // v_project_staleness was added in 0033. If the migration isn't applied
    // yet (e.g. local dev DB lagging), we soft-fail and treat everything as
    // non-stale rather than blocking the entire dashboard.
    const staleMap = new Map<string, boolean>();
    if (!staleRes.error) {
      for (const r of (staleRes.data ?? []) as { project_id: string; is_stale: boolean }[]) {
        staleMap.set(r.project_id, r.is_stale);
      }
    }
    const rows = (projRes.data ?? []) as Array<
      ProjectType & { last_activity_at: string | null }
    >;
    set({
      projects: rows.map((p) => ({
        ...p,
        is_stale: staleMap.get(p.id) ?? false,
      })),
    });
  },

  addProject: async (name, color, status) => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, status }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const { project } = (await res.json()) as { project: ProjectType };
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  updateProject: async (id, updates) => {
    const prev = get().projects;
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      set({ projects: prev });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
  },

  setProjectStatus: async (id, status) => {
    await get().updateProject(id, { status });
  },

  deleteProject: async (id) => {
    const prevProjects = get().projects;
    const prevTasks = get().tasks;
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      tasks: s.tasks.map((t) => ({
        ...t,
        project_ids: t.project_ids.filter((x) => x !== id),
      })),
    }));
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      set({ projects: prevProjects, tasks: prevTasks });
      throw new Error(`HTTP ${res.status}`);
    }
  },

  attachProjectToTask: async (taskId, projectId) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId && !t.project_ids.includes(projectId)
          ? { ...t, project_ids: [...t.project_ids, projectId] }
          : t,
      ),
    }));
    const res = await fetch(`/api/tasks/${taskId}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!res.ok) {
      set({ tasks: prev });
      throw new Error(`HTTP ${res.status}`);
    }
  },

  detachProjectFromTask: async (taskId, projectId) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, project_ids: t.project_ids.filter((x) => x !== projectId) }
          : t,
      ),
    }));
    const res = await fetch(
      `/api/tasks/${taskId}/projects/${projectId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      set({ tasks: prev });
      throw new Error(`HTTP ${res.status}`);
    }
  },

  updateTaskProjects: async (taskId, projectIds) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;
    const current = new Set(task.project_ids);
    const next = new Set(projectIds);
    const toAdd = projectIds.filter((id) => !current.has(id));
    const toRemove = task.project_ids.filter((id) => !next.has(id));
    await Promise.all([
      ...toAdd.map((id) => get().attachProjectToTask(taskId, id)),
      ...toRemove.map((id) => get().detachProjectFromTask(taskId, id)),
    ]);
  },

  // ---- Insights -----------------------------------------------------------
  insightsRange: 'month',
  insightsPayload: null,
  insightsLoading: false,
  insightsError: null,
  insightsFetchedAt: 0,
  insightsFetchedForRange: null,
  insightsSelectedProjectId: null,
  insightsSelectedTagId: null,

  // Phase 7 — Honest Score
  honestScore: null,
  honestScoreLoading: false,
  honestScoreError: null,
  fetchHonestScore: async (date, force) => {
    const { userId, honestScore, honestScoreLoading } = get();
    if (!userId) return;
    // Cache by date so toggling Insights tabs doesn't re-fetch. The server
    // defaults to yesterday-in-user-tz; the client passes `date` only when
    // the user explicitly picks a different day (Phase 7 doesn't expose
    // that picker yet, but the slice is ready for it).
    if (!force && honestScore && (!date || honestScore.date === date))
      return;
    if (honestScoreLoading) return;
    set({ honestScoreLoading: true, honestScoreError: null });
    try {
      const qs = date ? `?date=${encodeURIComponent(date)}` : '';
      const res = await fetch(`/api/insights/honest-score${qs}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as NonNullable<Store['honestScore']>;
      set({ honestScore: json, honestScoreLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load Honest Score';
      set({ honestScoreLoading: false, honestScoreError: message });
    }
  },

  setInsightsRange: (range) => {
    set({
      insightsRange: range,
      // Drill-down picks are range-scoped; clear on range change.
      insightsSelectedProjectId: null,
      insightsSelectedTagId: null,
    });
    void get().fetchInsights();
  },

  fetchInsights: async (force = false) => {
    const {
      insightsRange,
      insightsFetchedAt,
      insightsFetchedForRange,
      insightsPayload,
    } = get();
    // 60s cache if the range matches and we already have data.
    const isFresh =
      !force &&
      insightsPayload !== null &&
      insightsFetchedForRange === insightsRange &&
      Date.now() - insightsFetchedAt < 60_000;
    if (isFresh) return;
    set({ insightsLoading: true, insightsError: null });
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/insights?range=${insightsRange}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const payload = (await res.json()) as InsightsPayload;
      set({
        insightsPayload: payload,
        insightsLoading: false,
        insightsFetchedAt: Date.now(),
        insightsFetchedForRange: insightsRange,
        // Default drill-down picks to the top item if not already set.
        insightsSelectedProjectId:
          get().insightsSelectedProjectId ?? payload.projects[0]?.id ?? null,
        insightsSelectedTagId:
          get().insightsSelectedTagId ?? payload.tags[0]?.id ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load insights';
      set({ insightsLoading: false, insightsError: message });
    }
  },

  setInsightsSelectedProject: (id) => set({ insightsSelectedProjectId: id }),
  setInsightsSelectedTag: (id) => set({ insightsSelectedTagId: id }),
    }),
    {
      // Persist only the filters slice. Userid isn't known at module-eval time,
      // so we use a stable global key — mixing across accounts is rare on a
      // single browser, and a stale filter just gets cleared with one click.
      // Tags/categories/projects in stale filters silently no-op against the
      // current user's data.
      name: 'get-it-done:filters:v1',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') return window.localStorage;
        // SSR / Node: a no-op storage so persist middleware doesn't crash.
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) =>
        ({
          filters: state.filters,
          // Feature 09 — Schedule sub-tab + selected day persist across
          // reloads in localStorage. Server-side default for sub-tab lives
          // on user_preferences.schedule_default_subview and seeds via
          // fetchPrefs on first load.
          scheduleSubView: state.scheduleSubView,
          scheduleDayStartMs: state.scheduleDayStartMs,
          // Phase 1.1 — hide-completed preference persists locally. Initial
          // seed comes from user_preferences.hide_completed_default on the
          // first fetchPrefs call this session.
          showCompleted: state.showCompleted,
          // Phase 2 — persist the active top-level view so a returning user
          // lands back on whatever they had last (Today on first visit).
          view: state.view,
        }) as Partial<Store>,
    },
  ),
);
