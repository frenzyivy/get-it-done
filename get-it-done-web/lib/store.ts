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
  NotificationType,
  UserPrefs,
  AutomationRule,
  UserProfileV2,
  TrackedSession,
  PlannedBlock,
  FocusMode,
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
  subtasks: SubtaskType[] | null;
  task_tags: { tag_id: string }[] | null;
  task_categories: { category_id: string }[] | null;
  task_projects: { project_id: string }[] | null;
  time_sessions: TimeSession[] | null;
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
  const subtasks = (row.subtasks ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
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
    estimated_seconds: row.estimated_seconds ?? null,
    sort_order: row.sort_order,
    allow_alarms: row.allow_alarms ?? false,
    planned_for_date: row.planned_for_date ?? null,
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
  autoPauseIdleSessions: (lastActivityMs: number, idleThresholdMs: number) => Promise<void>;
  updateSessionTimes: (
    sessionId: string,
    startedAtISO: string,
    endedAtISO: string,
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
  // whether a newer toast superseded it.
  toast: { message: string; id: number } | null;
  showToast: (message: string) => void;
  dismissToast: (id?: number) => void;

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
  view: 'kanban',
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
    set((s) => ({ savedViews: [...s.savedViews, json.saved_view] }));
    return json.saved_view;
  },
  loadView: (id) => {
    const view = get().savedViews.find((v) => v.id === id);
    if (!view) return;
    // saved_views.view_type maps to ViewMode. 'board' → 'kanban', 'list' →
    // 'list', 'priority' → 'priority' (Phase 3 step 8). 'calendar' is still
    // reserved for the Phase 3 calendar step; those views apply filters but
    // don't switch view yet.
    const mode: ViewMode | null =
      view.view_type === 'board'
        ? 'kanban'
        : view.view_type === 'list'
          ? 'list'
          : view.view_type === 'priority'
            ? 'priority'
            : null;
    set({
      filters: {
        project_ids: view.filters.project_ids ?? [],
        category_ids: view.filters.category_ids ?? [],
        tag_ids: view.filters.tag_ids ?? [],
        priorities: view.filters.priorities ?? [],
      },
      ...(mode ? { view: mode } : {}),
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
    set((s) => ({ savedViews: s.savedViews.filter((v) => v.id !== id) }));
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
    if (data) set({ prefs: data as UserPrefs });
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
    const dur = Math.max(
      0,
      Math.floor((now.getTime() - new Date(sess.started_at).getTime()) / 1000),
    );
    const { error } = await supabase()
      .from('tracked_sessions')
      .update({ ended_at: now.toISOString(), duration_seconds: dur })
      .eq('id', sessionId);
    if (error) throw error;
    set((s) => ({
      activeSessions: s.activeSessions.filter((x) => x.id !== sessionId),
      lastStopSummary: { durationSeconds: dur, at: Date.now() },
      focusSessionId: s.focusSessionId === sessionId ? null : s.focusSessionId,
    }));
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
    const dur = Math.max(
      0,
      Math.floor((now.getTime() - new Date(sess.started_at).getTime()) / 1000),
    );
    const { error } = await supabase()
      .from('tracked_sessions')
      .update({
        ended_at: now.toISOString(),
        duration_seconds: dur,
        broken: true,
        broken_reason: reason,
      })
      .eq('id', sessionId);
    if (error) throw error;
    set((s) => ({
      activeSessions: s.activeSessions.filter((x) => x.id !== sessionId),
      lastStopSummary: { durationSeconds: dur, at: Date.now() },
      focusSessionId: s.focusSessionId === sessionId ? null : s.focusSessionId,
    }));
    await get().fetchProfileV2();
  },

  // Pause is modeled as stop + was_paused=true; resume creates a new row. This
  // keeps time-during-pause out of totals cleanly and avoids a schema change.
  pauseSession: async (sessionId) => {
    const { activeSessions } = get();
    const sess = activeSessions.find((s) => s.id === sessionId);
    if (!sess) return;
    const now = new Date();
    const dur = Math.max(
      0,
      Math.floor((now.getTime() - new Date(sess.started_at).getTime()) / 1000),
    );
    const { error } = await supabase()
      .from('tracked_sessions')
      .update({
        ended_at: now.toISOString(),
        duration_seconds: dur,
        was_paused: true,
      })
      .eq('id', sessionId);
    if (error) throw error;
    set((s) => ({
      activeSessions: s.activeSessions.filter((x) => x.id !== sessionId),
      focusSessionId: s.focusSessionId === sessionId ? null : s.focusSessionId,
    }));
  },

  // Activity-based idle auto-pause. For each running session, if the user has
  // been idle longer than `idleThresholdMs`, end the session at the last-
  // activity timestamp (not "now") so untracked idle time isn't attributed to
  // work. Sessions younger than the threshold are untouched.
  autoPauseIdleSessions: async (lastActivityMs, idleThresholdMs) => {
    const { activeSessions } = get();
    if (activeSessions.length === 0) return;
    const idleFor = Date.now() - lastActivityMs;
    if (idleFor < idleThresholdMs) return;
    const endAtMs = lastActivityMs;
    const endAtISO = new Date(endAtMs).toISOString();
    const db = supabase();
    const toPause = activeSessions.filter((s) => {
      const start = new Date(s.started_at).getTime();
      return endAtMs > start;
    });
    if (toPause.length === 0) return;
    await Promise.all(
      toPause.map((s) => {
        const dur = Math.max(
          0,
          Math.floor((endAtMs - new Date(s.started_at).getTime()) / 1000),
        );
        return db
          .from('tracked_sessions')
          .update({ ended_at: endAtISO, duration_seconds: dur, was_paused: true })
          .eq('id', s.id);
      }),
    );
    const pausedIds = new Set(toPause.map((s) => s.id));
    set((s) => ({
      activeSessions: s.activeSessions.filter((x) => !pausedIds.has(x.id)),
      focusSessionId:
        s.focusSessionId && pausedIds.has(s.focusSessionId) ? null : s.focusSessionId,
    }));
  },

  // Manually edit a session's start/end window. Used by the Timeline "Adjust"
  // popover so users can trim an abandoned timer that painted too much time.
  // Recomputes duration_seconds from the new window.
  updateSessionTimes: async (sessionId, startedAtISO, endedAtISO) => {
    const startMs = new Date(startedAtISO).getTime();
    const endMs = new Date(endedAtISO).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error('Invalid session window');
    }
    const dur = Math.floor((endMs - startMs) / 1000);
    const { error } = await supabase()
      .from('tracked_sessions')
      .update({
        started_at: startedAtISO,
        ended_at: endedAtISO,
        duration_seconds: dur,
      })
      .eq('id', sessionId);
    if (error) throw error;
    set((s) => ({
      activeSessions: s.activeSessions.filter((x) => x.id !== sessionId),
    }));
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
  },

  // Called every 30s by useLiveTimer so a browser crash doesn't lose progress.
  persistActiveSessionDurations: async () => {
    const { activeSessions } = get();
    if (activeSessions.length === 0) return;
    const db = supabase();
    await Promise.all(
      activeSessions.map((s) => {
        const dur = Math.max(
          0,
          Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000),
        );
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
          planned_for_date,
          subtasks ( id, task_id, title, is_done, total_time_seconds, sort_order ),
          task_tags ( tag_id ),
          task_categories ( category_id ),
          task_projects ( project_id ),
          time_sessions ( id, task_id, subtask_id, started_at, duration_seconds, label )
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
      // A fresh task has no tracked_sessions and no completed_at, so
      // v_task_status will derive 'todo'. Hardcode the local seed to match
      // the spec invariant (no flicker through 'in_progress' or 'done').
      }, 'todo'),
      tag_ids: input.tag_ids,
      category_ids: categoryIds,
      project_ids: projectIds,
    };
    set((s) => ({ tasks: [...s.tasks, newTask] }));
    return task.id;
  },

  updateTask: async (id, updates) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const merged = { ...t, ...updates };
        // Re-derive effective_status locally to mirror v_task_status. The next
        // fetchTasks reconfirms; this prevents flicker between click and refetch.
        // Especially critical for Done-checkbox toggles where the user expects
        // immediate visual feedback.
        merged.effective_status = deriveEffectiveStatus(merged);
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
    if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;
    if (Object.keys(payload).length === 0) return;
    const { error } = await supabase().from('tasks').update(payload).eq('id', id);
    if (error) {
      set({ tasks: prev });
      throw error;
    }
  },

  deleteTask: async (id) => {
    const prev = get().tasks;
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    const { error } = await supabase().from('tasks').delete().eq('id', id);
    if (error) {
      set({ tasks: prev });
      throw error;
    }
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
    const sub = data as SubtaskType;
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
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, subtasks: updatedSubs, status: nextStatus } : t,
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
    if (nextStatus !== task.status) {
      const { error: taskErr } = await supabase()
        .from('tasks')
        .update({ status: nextStatus })
        .eq('id', taskId);
      if (taskErr) {
        set({ tasks: prev });
        throw taskErr;
      }
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
    const { data, error } = await supabase()
      .from('projects')
      .select('id, name, color, status')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    set({ projects: (data ?? []) as ProjectType[] });
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
      partialize: (state) => ({ filters: state.filters }) as Partial<Store>,
    },
  ),
);
