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
  NotificationType,
  UserPrefs,
  AutomationRule,
  UserProfileV2,
  TrackedSession,
  PlannedBlock,
} from '@/types';

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  status: Status;
  priority: TaskType['priority'];
  due_date: string | null;
  total_time_seconds: number;
  estimated_seconds: number | null;
  sort_order: number;
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
    status: row.status,
    priority: row.priority,
    due_date: row.due_date,
    total_time_seconds: row.total_time_seconds,
    estimated_seconds: row.estimated_seconds ?? null,
    sort_order: row.sort_order,
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

  notifications: NotificationType[];
  prefs: UserPrefs | null;
  rules: AutomationRule[];
  notifUnsubscribe: (() => void) | null;

  setView: (view: ViewMode) => void;
  setUserId: (id: string | null) => void;

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
  activeSession: TrackedSession | null;
  activeColumn: Status;
  lastStopSummary: { durationSeconds: number; at: number } | null;
  fetchProfileV2: () => Promise<void>;
  fetchActiveSession: () => Promise<void>;
  setActiveColumn: (col: Status) => void;
  startTrackingTask: (taskId: string, subtaskId?: string | null) => Promise<void>;
  pauseActiveSession: () => Promise<void>;
  stopActiveSession: () => Promise<void>;
  persistActiveSessionDuration: () => Promise<void>;
  clearStopSummary: () => void;

  plannedBlocks: PlannedBlock[];
  fetchPlannedBlocks: (fromISO: string, toISO: string) => Promise<void>;
  addPlannedBlock: (input: Omit<PlannedBlock, 'id' | 'user_id'>) => Promise<void>;
  updatePlannedBlock: (id: string, updates: Partial<PlannedBlock>) => Promise<void>;
  deletePlannedBlock: (id: string) => Promise<void>;

  addTask: (input: NewTaskInput) => Promise<void>;
  updateTask: (id: string, updates: Partial<TaskType>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  moveTask: (id: string, status: Status) => Promise<void>;

  addSubtask: (taskId: string, title: string) => Promise<void>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  renameSubtask: (taskId: string, subtaskId: string, title: string) => Promise<void>;
  deleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;

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

  notifications: [],
  prefs: null,
  rules: [],
  notifUnsubscribe: null,

  setView: (view) => set({ view }),
  setUserId: (userId) => set({ userId }),

  fetchAll: async () => {
    set({ loading: true });
    await Promise.all([
      get().fetchTags(),
      get().fetchTasks(),
      get().fetchNotifications(),
      get().fetchPrefs(),
      get().fetchRules(),
      get().fetchProfileV2(),
      get().fetchActiveSession(),
    ]);
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
  activeSession: null,
  activeColumn: 'in_progress',
  lastStopSummary: null,

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

  fetchActiveSession: async () => {
    const { userId } = get();
    if (!userId) return;
    const { data, error } = await supabase()
      .from('tracked_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    set({ activeSession: (data as TrackedSession | null) ?? null });
  },

  setActiveColumn: (col) => set({ activeColumn: col }),

  startTrackingTask: async (taskId, subtaskId = null) => {
    const { userId, activeSession } = get();
    if (!userId) return;
    const db = supabase();
    // Enforce "only one active session": stop existing first.
    if (activeSession) {
      const now = new Date();
      const dur = Math.floor(
        (now.getTime() - new Date(activeSession.started_at).getTime()) / 1000,
      );
      await db
        .from('tracked_sessions')
        .update({ ended_at: now.toISOString(), duration_seconds: dur })
        .eq('id', activeSession.id);
    }
    const { data, error } = await db
      .from('tracked_sessions')
      .insert({
        user_id: userId,
        task_id: taskId,
        subtask_id: subtaskId,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    set({ activeSession: data as TrackedSession });
  },

  stopActiveSession: async () => {
    const { activeSession } = get();
    if (!activeSession) return;
    const now = new Date();
    const dur = Math.max(
      0,
      Math.floor(
        (now.getTime() - new Date(activeSession.started_at).getTime()) / 1000,
      ),
    );
    const { error } = await supabase()
      .from('tracked_sessions')
      .update({ ended_at: now.toISOString(), duration_seconds: dur })
      .eq('id', activeSession.id);
    if (error) throw error;
    set({
      activeSession: null,
      lastStopSummary: { durationSeconds: dur, at: Date.now() },
    });
  },

  // Pause is modeled as stop + was_paused=true; resume creates a new row. This
  // keeps time-during-pause out of totals cleanly and avoids a schema change.
  pauseActiveSession: async () => {
    const { activeSession } = get();
    if (!activeSession) return;
    const now = new Date();
    const dur = Math.max(
      0,
      Math.floor(
        (now.getTime() - new Date(activeSession.started_at).getTime()) / 1000,
      ),
    );
    const { error } = await supabase()
      .from('tracked_sessions')
      .update({
        ended_at: now.toISOString(),
        duration_seconds: dur,
        was_paused: true,
      })
      .eq('id', activeSession.id);
    if (error) throw error;
    set({ activeSession: null });
  },

  // Write the current elapsed time to duration_seconds without ending the row.
  // Called every 30s by useLiveTimer so a browser crash doesn't lose progress.
  persistActiveSessionDuration: async () => {
    const { activeSession } = get();
    if (!activeSession) return;
    const dur = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(activeSession.started_at).getTime()) / 1000,
      ),
    );
    await supabase()
      .from('tracked_sessions')
      .update({ duration_seconds: dur })
      .eq('id', activeSession.id);
  },

  clearStopSummary: () => set({ lastStopSummary: null }),

  plannedBlocks: [],

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
    const { data, error } = await supabase()
      .from('tasks')
      .select(
        `
        id, user_id, title, status, priority, due_date,
        total_time_seconds, estimated_seconds, sort_order,
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
    if (!userId) return;
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
    if (input.tag_ids.length > 0) {
      const { error: tagErr } = await supabase()
        .from('task_tags')
        .insert(input.tag_ids.map((tag_id) => ({ task_id: task.id, tag_id })));
      if (tagErr) throw tagErr;
    }
    const newTask: TaskType = {
      ...rowToTask({ ...task, subtasks: [], task_tags: [], time_sessions: [] }),
      tag_ids: input.tag_ids,
    };
    set((s) => ({ tasks: [...s.tasks, newTask] }));
  },

  updateTask: async (id, updates) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
    const payload: Record<string, unknown> = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.priority !== undefined) payload.priority = updates.priority;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.due_date !== undefined) payload.due_date = updates.due_date;
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
}));
