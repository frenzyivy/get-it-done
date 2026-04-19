import { create } from 'zustand';
import { supabase } from './supabase';
import type {
  TaskType,
  TagType,
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
} from '@/types';

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: TaskType['priority'];
  due_date: string | null;
  total_time_seconds: number;
  estimated_seconds: number | null;
  sort_order: number;
  allow_alarms: boolean | null;
  planned_for_date: string | null;
  subtasks: SubtaskType[] | null;
  task_tags: { tag_id: string }[] | null;
  time_sessions: TimeSession[] | null;
}

function rowToTask(row: TaskRow): TaskType {
  const subtasks = (row.subtasks ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    priority: row.priority,
    due_date: row.due_date,
    total_time_seconds: row.total_time_seconds,
    estimated_seconds: row.estimated_seconds ?? null,
    sort_order: row.sort_order,
    allow_alarms: row.allow_alarms ?? false,
    planned_for_date: row.planned_for_date ?? null,
    tag_ids: (row.task_tags ?? []).map((t) => t.tag_id),
    subtasks,
    sessions: row.time_sessions ?? [],
  };
}

interface Store {
  tasks: TaskType[];
  tags: TagType[];
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
  ) => Promise<TrackedSession | null>;
  pauseSession: (sessionId: string) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;
  persistActiveSessionDurations: () => Promise<void>;
  appendDriftEvent: (sessionId: string, drift: DriftEvent) => Promise<void>;
  updateSessionMode: (sessionId: string, mode: FocusMode) => Promise<void>;
  openFocusMode: (sessionId: string) => void;
  closeFocusMode: () => void;
  clearStopSummary: () => void;

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
}

export const useStore = create<Store>((set, get) => ({
  tasks: [],
  tags: [],
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
    await Promise.all([
      get().fetchTags(),
      get().fetchTasks(),
      get().fetchNotifications(),
      get().fetchPrefs(),
      get().fetchRules(),
      get().fetchProfileV2(),
      get().fetchActiveSessions(),
    ]);
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

  startTrackingTask: async (taskId, subtaskId = null, mode = 'open') => {
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
      })
      .select()
      .single();
    if (error) throw error;
    const row = data as TrackedSession;
    set((s) => ({ activeSessions: [...s.activeSessions, row] }));
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
    const { data, error } = await supabase
      .from('tasks')
      .select(
        `
        id, user_id, title, description, status, priority, due_date,
        total_time_seconds, estimated_seconds, sort_order, allow_alarms,
        planned_for_date,
        subtasks ( id, task_id, title, is_done, total_time_seconds, sort_order ),
        task_tags ( tag_id ),
        time_sessions ( id, task_id, subtask_id, started_at, duration_seconds, label )
      `,
      )
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as unknown as TaskRow[];
    set({ tasks: rows.map(rowToTask) });
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
    if (input.tag_ids.length > 0) {
      const { error: tagErr } = await supabase
        .from('task_tags')
        .insert(input.tag_ids.map((tag_id) => ({ task_id: task.id, tag_id })));
      if (tagErr) throw tagErr;
    }
    const newTask: TaskType = {
      ...rowToTask({
        ...task,
        description: task.description ?? null,
        allow_alarms: task.allow_alarms ?? false,
        planned_for_date: task.planned_for_date ?? null,
        subtasks: [],
        task_tags: [],
        time_sessions: [],
      }),
      tag_ids: input.tag_ids,
    };
    set((s) => ({ tasks: [...s.tasks, newTask] }));
    return task.id;
  },

  updateTask: async (id, updates) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
    const payload: Record<string, unknown> = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.priority !== undefined) payload.priority = updates.priority;
    if (updates.status !== undefined) payload.status = updates.status;
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
}));
