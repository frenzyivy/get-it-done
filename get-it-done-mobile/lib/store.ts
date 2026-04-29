import { create } from 'zustand';
import { supabase } from './supabase';
import { labelsApi } from './labels-api';
import { fetchStreakHistory as fetchStreakHistoryApi } from './insights';
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
  RunningTimer,
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
  DailyTargets,
} from '@/types';

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
 * Mirror of v_task_status (migration 0023). Used as a fallback when the view
 * row is missing for a freshly-inserted task, and for OPTIMISTIC updates after
 * mutations. The view-merged value from fetchTasks is the source of truth and
 * replaces this on the next fetch.
 *
 * Same caveat as web: this can't see *open* sessions (tracked_sessions with
 * ended_at IS NULL). For Done-checkbox toggles the closed-session set is
 * enough; live sessions are tracked separately via activeSessions[].
 */
export function deriveEffectiveStatus(
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
  runningTimer: RunningTimer | null;

  notifications: NotificationType[];
  prefs: UserPrefs | null;
  rules: AutomationRule[];
  notifUnsubscribe: (() => void) | null;

  setView: (view: ViewMode) => void;
  setUserId: (id: string | null) => void;
  setRunningTimer: (t: RunningTimer | null) => void;
  tickRunningTimer: () => void;

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
  activeSessions: TrackedSession[];
  activeColumn: Status;
  lastStopSummary: { durationSeconds: number; at: number } | null;
  focusSessionId: string | null;
  fetchProfileV2: () => Promise<void>;
  updateRolloverPromptDate: (dateISO: string) => Promise<void>;
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
  pauseSession: (sessionId: string) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;
  completeSession: (sessionId: string) => Promise<void>;
  markSessionBroken: (sessionId: string, reason: string) => Promise<void>;
  persistActiveSessionDurations: () => Promise<void>;
  appendDriftEvent: (sessionId: string, drift: DriftEvent) => Promise<void>;
  updateSessionMode: (sessionId: string, mode: FocusMode) => Promise<void>;
  openFocusMode: (sessionId: string) => void;
  closeFocusMode: () => void;
  clearStopSummary: () => void;

  // Calendar view (Phase 7 step C). dailyTargets is one row from
  // daily_targets (RLS-scoped); secondsByDay is keyed YYYY-MM-DD in local
  // time, populated by fetchSessionsByDay(from, to).
  dailyTargets: DailyTargets | null;
  fetchDailyTargets: () => Promise<void>;
  secondsByDay: Record<string, number>;
  secondsByDayRange: { from: string; to: string } | null;
  fetchSessionsByDay: (from: string, to: string) => Promise<void>;

  // When You Work heatmap (Phase 7 step E). 7×24 matrix indexed
  // [day][hour] where day is 0=Sun..6=Sat (matching JS Date.getDay()) and
  // hour is 0..23. Bucketed by session.started_at in the device's local
  // timezone. Hour-crossers and midnight-crossers fall entirely in their
  // start cell — same simplified directional-signal model.
  hourOfWeekRange: '7d' | '30d' | '90d';
  hourOfWeekMatrix: number[][] | null;
  hourOfWeekFetchedFor: '7d' | '30d' | '90d' | null;
  setHourOfWeekRange: (range: '7d' | '30d' | '90d') => void;
  fetchHourOfWeek: (force?: boolean) => Promise<void>;

  // Streak history (Phase 7 step E2) — last 84 days of streak length.
  // Hits the deployed web endpoint via EXPO_PUBLIC_WEB_URL so the streak
  // rule stays single-sourced. Cache key is the local-tz "today" date.
  streakHistory: {
    days: { date: string; streak: number; qualified: boolean }[];
    peakValue: number;
    peakDate: string | null;
    today: string;
  } | null;
  streakHistoryFetchedFor: string | null;
  fetchStreakHistory: (force?: boolean) => Promise<void>;

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

  // Categories (AGENT1).
  addCategory: (name: string, color?: string) => Promise<CategoryType | null>;
  updateCategory: (id: string, updates: { name?: string; color?: string }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  attachCategoryToTask: (taskId: string, categoryId: string) => Promise<void>;
  detachCategoryFromTask: (taskId: string, categoryId: string) => Promise<void>;
  updateTaskCategories: (taskId: string, categoryIds: string[]) => Promise<void>;

  // Projects (AGENT1).
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
}

export const useStore = create<Store>((set, get) => ({
  tasks: [],
  tags: [],
  categories: [],
  projects: [],
  view: 'kanban',
  userId: null,
  loading: false,
  runningTimer: null,

  notifications: [],
  prefs: null,
  rules: [],
  notifUnsubscribe: null,

  setView: (view) => set({ view }),
  setUserId: (userId) => set({ userId }),
  setRunningTimer: (t) => set({ runningTimer: t }),
  tickRunningTimer: () =>
    set((s) =>
      s.runningTimer
        ? { runningTimer: { ...s.runningTimer, elapsed: s.runningTimer.elapsed + 1 } }
        : s,
    ),

  fetchAll: async () => {
    set({ loading: true });
    // allSettled so one failing fetcher (e.g. categories before its migration
    // runs) doesn't prevent the rest from loading.
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
    const { data, error } = await supabase
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
    // Idempotent: if a channel already exists (e.g. auth listener re-fired
    // fetchAll), tear it down before creating a new one. Supabase Realtime v2
    // throws "cannot add postgres_changes callbacks after subscribe()" if we
    // try to attach a handler to an already-subscribed channel.
    if (notifUnsubscribe) {
      notifUnsubscribe();
      set({ notifUnsubscribe: null });
    }
    const channel = supabase
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
        supabase.removeChannel(channel);
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
    const { error } = await supabase
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
    const { error } = await supabase
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
    const { data, error } = await supabase
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
    const { error } = await supabase
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
    const { data, error } = await supabase
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
    const { error } = await supabase
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
    const { data, error } = await supabase
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
    await supabase
      .from('user_profiles')
      .update({ last_rollover_prompt_date: dateISO })
      .eq('user_id', userId);
  },

  setPlannedForDateBulk: async (updates) => {
    if (updates.length === 0) return;
    const prev = get().tasks;
    const byId = new Map(updates.map((u) => [u.id, u.planned_for_date]));
    set((s) => ({
      tasks: s.tasks.map((t) =>
        byId.has(t.id) ? { ...t, planned_for_date: byId.get(t.id) ?? null } : t,
      ),
    }));
    const results = await Promise.all(
      updates.map((u) =>
        supabase
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

  fetchActiveSessions: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase
      .from('tracked_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('started_at', { ascending: true });
    if (error) throw error;
    set({ activeSessions: (data ?? []) as TrackedSession[] });
  },

  setActiveColumn: (col) => set({ activeColumn: col }),

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
    const { data, error } = await supabase
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
    // refetch round-trip.
    const parent = get().tasks.find((t) => t.id === taskId);
    if (parent && parent.effective_status === 'todo') {
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? { ...t, status: 'in_progress', effective_status: 'in_progress' }
            : t,
        ),
      }));
      const { error: promoteErr } = await supabase
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
    const { error } = await supabase
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

  // Focus Lock — countdown reached zero. Same as stopSession but refreshes
  // the streak from the server (the SQL trigger may have bumped it).
  completeSession: async (sessionId) => {
    await get().stopSession(sessionId);
    await get().fetchProfileV2();
  },

  // Focus Lock — user exited a Strict session early. Writes broken=true +
  // reason, ends the session, then re-fetches profile so the now-reset
  // streak flips to 0 in the UI.
  markSessionBroken: async (sessionId, reason) => {
    const { activeSessions } = get();
    const sess = activeSessions.find((s) => s.id === sessionId);
    if (!sess) return;
    const now = new Date();
    const dur = Math.max(
      0,
      Math.floor((now.getTime() - new Date(sess.started_at).getTime()) / 1000),
    );
    const { error } = await supabase
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

  pauseSession: async (sessionId) => {
    const { activeSessions } = get();
    const sess = activeSessions.find((s) => s.id === sessionId);
    if (!sess) return;
    const now = new Date();
    const dur = Math.max(
      0,
      Math.floor((now.getTime() - new Date(sess.started_at).getTime()) / 1000),
    );
    const { error } = await supabase
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

  persistActiveSessionDurations: async () => {
    const { activeSessions } = get();
    if (activeSessions.length === 0) return;
    await Promise.all(
      activeSessions.map((s) => {
        const dur = Math.max(
          0,
          Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000),
        );
        return supabase
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
    await supabase
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
    await supabase
      .from('tracked_sessions')
      .update({ mode })
      .eq('id', sessionId);
  },

  openFocusMode: (sessionId) => set({ focusSessionId: sessionId }),
  closeFocusMode: () => set({ focusSessionId: null }),

  clearStopSummary: () => set({ lastStopSummary: null }),

  plannedBlocks: [],

  // Calendar view state — initial nulls; lazy-fetched on first mount.
  dailyTargets: null,
  secondsByDay: {},
  secondsByDayRange: null,
  fetchDailyTargets: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase
      .from('daily_targets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('[store.fetchDailyTargets]', error.message);
      return;
    }
    if (data) {
      set({ dailyTargets: data as DailyTargets });
      return;
    }
    // No row yet — insert the spec's "Balanced" preset and use that. The
    // table defaults match the preset, so an INSERT with empty body works.
    const { data: inserted, error: insErr } = await supabase
      .from('daily_targets')
      .insert({ user_id: userId, preset_name: 'balanced' })
      .select()
      .single();
    if (insErr) {
      console.error('[store.fetchDailyTargets][insert]', insErr.message);
      return;
    }
    set({ dailyTargets: inserted as DailyTargets });
  },
  fetchSessionsByDay: async (from, to) => {
    const { userId } = get();
    if (!userId) return;
    // Pad ±1 day so timezone offsets never miss sessions; final filtering
    // happens in JS by formatted local date. Mirrors the web by-day route.
    const padDay = (iso: string, deltaDays: number): string => {
      const [y, m, d] = iso.split('-').map(Number);
      const t = Date.UTC(y, m - 1, d) + deltaDays * 24 * 60 * 60 * 1000;
      return new Date(t).toISOString();
    };
    const sinceIso = padDay(from, -1);
    const untilIso = padDay(to, 2);
    const { data, error } = await supabase
      .from('tracked_sessions')
      .select('started_at, duration_seconds')
      .eq('user_id', userId)
      .gte('started_at', sinceIso)
      .lt('started_at', untilIso)
      .not('duration_seconds', 'is', null);
    if (error) {
      console.error('[store.fetchSessionsByDay]', error.message);
      return;
    }
    const fmt = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const out: Record<string, number> = {};
    for (const row of (data ?? []) as { started_at: string; duration_seconds: number | null }[]) {
      const seconds = row.duration_seconds ?? 0;
      if (seconds <= 0) continue;
      const localDate = fmt.format(new Date(row.started_at));
      if (localDate < from || localDate > to) continue;
      out[localDate] = (out[localDate] ?? 0) + seconds;
    }
    set({ secondsByDay: out, secondsByDayRange: { from, to } });
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
    const days = hourOfWeekRange === '7d' ? 7 : hourOfWeekRange === '30d' ? 30 : 90;
    const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
    const sinceIso = new Date(sinceMs).toISOString();
    const { data, error } = await supabase
      .from('tracked_sessions')
      .select('started_at, duration_seconds')
      .eq('user_id', userId)
      .gte('started_at', sinceIso)
      .not('duration_seconds', 'is', null);
    if (error) {
      console.error('[store.fetchHourOfWeek]', error.message);
      return;
    }
    // 7 days × 24 hours, all zeros.
    const matrix: number[][] = Array.from({ length: 7 }, () =>
      Array<number>(24).fill(0),
    );
    for (const row of (data ?? []) as { started_at: string; duration_seconds: number | null }[]) {
      const seconds = row.duration_seconds ?? 0;
      if (seconds <= 0) continue;
      const d = new Date(row.started_at);
      const dow = d.getDay(); // 0=Sun..6=Sat
      const hour = d.getHours();
      if (dow < 0 || dow > 6 || hour < 0 || hour > 23) continue;
      matrix[dow][hour] += seconds;
    }
    set({ hourOfWeekMatrix: matrix, hourOfWeekFetchedFor: hourOfWeekRange });
  },

  streakHistory: null,
  streakHistoryFetchedFor: null,
  fetchStreakHistory: async (force) => {
    const { userId, streakHistoryFetchedFor } = get();
    if (!userId) return;
    // Cache key is local-tz "today" date string. Server resolves the user's
    // tz independently; if the local guess differs, worst case is one extra
    // fetch on the day boundary.
    const localTodayKey = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();
    if (!force && streakHistoryFetchedFor === localTodayKey) return;
    try {
      const json = await fetchStreakHistoryApi();
      set({
        streakHistory: {
          days: json.days,
          peakValue: json.peak_value,
          peakDate: json.peak_date,
          today: json.today,
        },
        streakHistoryFetchedFor: json.today,
      });
    } catch (e) {
      console.error('[store.fetchStreakHistory]', (e as Error).message);
    }
  },

  recurringTemplates: [],

  fetchRecurringTemplates: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
    const { error } = await supabase
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
    const { error } = await supabase
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
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
    const { error } = await supabase
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
    const { error } = await supabase.from('planned_blocks').delete().eq('id', id);
    if (error) {
      set({ plannedBlocks: prev });
      throw error;
    }
  },

  fetchTags: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase
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
    // Parallel two-query merge — same shape as web (Phase 1 step 3). The
    // tasks table is fetched with embeds; v_task_status (migration 0023) is
    // a derived read-only view that PostgREST can't embed because views have
    // no FK relationships. Merge by id; fall back to row.status when a row
    // is missing from the view (e.g., immediately after insert).
    const [tasksRes, statusRes] = await Promise.all([
      supabase
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
      supabase
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
    set({
      tasks: rows.map((row) => rowToTask(row, statusMap.get(row.id) ?? row.status)),
    });
  },

  addTask: async (input) => {
    const { userId } = get();
    if (!userId) return null;
    const { data, error } = await supabase
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
      const { error: tagErr } = await supabase
        .from('task_tags')
        .insert(input.tag_ids.map((tag_id) => ({ task_id: task.id, tag_id })));
      if (tagErr) throw tagErr;
    }
    // Category/project attaches go through the labels API (bearer token) so we
    // stay consistent with how web handles them. Fire-and-await in sequence is
    // fine for new tasks (usually 0–2 of each).
    for (const categoryId of categoryIds) {
      await labelsApi.attachCategory(task.id, categoryId);
    }
    for (const projectId of projectIds) {
      await labelsApi.attachProject(task.id, projectId);
    }
    const newTask: TaskType = {
      ...rowToTask(
        {
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
        },
        // Brand-new task with no sessions and no completed_at → 'todo'.
        deriveEffectiveStatus({ completed_at: task.completed_at ?? null, sessions: [] }),
      ),
      tag_ids: input.tag_ids,
      category_ids: categoryIds,
      project_ids: projectIds,
    };
    set((s) => ({ tasks: [...s.tasks, newTask] }));
    return task.id;
  },

  updateTask: async (id, updates) => {
    const prev = get().tasks;
    // Optimistic update. If `completed_at` is part of the patch, also flip
    // effective_status so the UI updates instantly without waiting for the
    // next fetchTasks to merge v_task_status. Setting completed_at to a
    // value → 'done'; clearing it → re-derive from sessions/legacy status.
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...updates };
        if (updates.completed_at !== undefined) {
          next.effective_status = deriveEffectiveStatus({
            completed_at: next.completed_at,
            sessions: next.sessions,
          });
        }
        return next;
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
    const { error } = await supabase.from('tasks').update(payload).eq('id', id);
    if (error) {
      set({ tasks: prev });
      throw error;
    }
  },

  deleteTask: async (id) => {
    const prev = get().tasks;
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    const { error } = await supabase.from('tasks').delete().eq('id', id);
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
    const { data, error } = await supabase
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

    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, subtasks: updatedSubs, status: nextStatus } : t,
      ),
    }));

    const { error } = await supabase
      .from('subtasks')
      .update({ is_done: newDone })
      .eq('id', subtaskId);
    if (error) {
      set({ tasks: prev });
      throw error;
    }
    if (nextStatus !== task.status) {
      const { error: taskErr } = await supabase
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
    const { error } = await supabase
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
    const { error } = await supabase.from('subtasks').delete().eq('id', subtaskId);
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
    const results = await Promise.all(
      next.map((s) =>
        supabase.from('subtasks').update({ sort_order: s.sort_order }).eq('id', s.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      set({ tasks: prev });
      throw failed.error;
    }
  },

  saveTimeSession: async (taskId, subtaskId, startedAt, duration, label) => {
    const { error } = await supabase.rpc('save_time_session', {
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
          id: String(Math.random()).slice(2),
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
    const { data, error } = await supabase
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
    const { error } = await supabase.from('tags').delete().eq('id', id);
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
    const { error: delErr } = await supabase
      .from('task_tags')
      .delete()
      .eq('task_id', taskId);
    if (delErr) {
      set({ tasks: prev });
      throw delErr;
    }
    if (tagIds.length > 0) {
      const { error: insErr } = await supabase
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
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, color')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    set({ categories: (data ?? []) as CategoryType[] });
  },

  addCategory: async (name, color) => {
    const res = await labelsApi.createCategory({ name, color });
    if (!res) return null;
    const { category } = res;
    set((s) => ({ categories: [...s.categories, category] }));
    return category;
  },

  updateCategory: async (id, updates) => {
    const prev = get().categories;
    set((s) => ({
      categories: s.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
    try {
      await labelsApi.updateCategory(id, updates);
    } catch (err) {
      set({ categories: prev });
      throw err;
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
    try {
      await labelsApi.deleteCategory(id);
    } catch (err) {
      set({ categories: prevCats, tasks: prevTasks });
      throw err;
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
    try {
      await labelsApi.attachCategory(taskId, categoryId);
    } catch (err) {
      set({ tasks: prev });
      throw err;
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
    try {
      await labelsApi.detachCategory(taskId, categoryId);
    } catch (err) {
      set({ tasks: prev });
      throw err;
    }
  },

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
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, color, status')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    set({ projects: (data ?? []) as ProjectType[] });
  },

  addProject: async (name, color, status) => {
    const res = await labelsApi.createProject({ name, color, status });
    if (!res) return null;
    const { project } = res;
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  updateProject: async (id, updates) => {
    const prev = get().projects;
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
    try {
      await labelsApi.updateProject(id, updates);
    } catch (err) {
      set({ projects: prev });
      throw err;
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
    try {
      await labelsApi.deleteProject(id);
    } catch (err) {
      set({ projects: prevProjects, tasks: prevTasks });
      throw err;
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
    try {
      await labelsApi.attachProject(taskId, projectId);
    } catch (err) {
      set({ tasks: prev });
      throw err;
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
    try {
      await labelsApi.detachProject(taskId, projectId);
    } catch (err) {
      set({ tasks: prev });
      throw err;
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
}));
