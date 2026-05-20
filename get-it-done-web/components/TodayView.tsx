'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '@/lib/store';
import { useLiveTimers } from '@/lib/useLiveTimer';
import { fmtShort, todayISO } from '@/lib/utils';
import { matchesFilters } from '@/lib/filters';
import { matchesSearch } from '@/lib/matchers';
import { PriorityBadge } from './PriorityBadge';
import { ProjectBadge } from './ProjectBadge';
import { CategoryPill } from './CategoryPill';
import { EditTaskDrawer } from './EditTaskDrawer';
import { SearchResultsDropdown } from './SearchResultsDropdown';
import type { TaskType } from '@/types';

// Phase 2 — Today view. Sequenced vertical execution list. Task #1 is "what
// you do next." Drag to set sequence; the top row gets a filled play button,
// the rest get an outlined checkbox.

const NEXT_ACTION_STORAGE_KEY = 'get-it-done:today:nextAction';

type NextAction = 'prompt' | 'auto_start' | 'manual';

interface NextActionMemo {
  date: string; // YYYY-MM-DD — invalidated when the day rolls over
  choice: NextAction;
}

function readNextActionMemo(today: string): NextAction {
  if (typeof window === 'undefined') return 'prompt';
  try {
    const raw = window.localStorage.getItem(NEXT_ACTION_STORAGE_KEY);
    if (!raw) return 'prompt';
    const memo = JSON.parse(raw) as NextActionMemo;
    if (memo.date !== today) return 'prompt';
    return memo.choice;
  } catch {
    return 'prompt';
  }
}

function writeNextActionMemo(today: string, choice: NextAction): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      NEXT_ACTION_STORAGE_KEY,
      JSON.stringify({ date: today, choice }),
    );
  } catch {
    // Storage quota / private mode — fine, just don't memo.
  }
}

export function TodayView() {
  const today = todayISO();
  const tasks = useStore((s) => s.tasks);
  const filters = useStore((s) => s.filters);
  const searchQuery = useStore((s) => s.searchQuery);
  const projects = useStore((s) => s.projects);
  const tags = useStore((s) => s.tags);
  const reorderToday = useStore((s) => s.reorderToday);
  const addTaskToToday = useStore((s) => s.addTaskToToday);
  const activeSessions = useStore((s) => s.activeSessions);
  const prefs = useStore((s) => s.prefs);
  const startTrackingTask = useStore((s) => s.startTrackingTask);
  const stopSession = useStore((s) => s.stopSession);
  const updateTask = useStore((s) => s.updateTask);
  const openFocusMode = useStore((s) => s.openFocusMode);
  const showToast = useStore((s) => s.showToast);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Filter/search applied here too so the global filter bar's existing
  // semantics carry into Today. Done tasks always render, but at the bottom
  // and dimmed — they're informative ("what you got done today").
  const tasksForToday = useMemo(() => {
    return tasks
      .filter(
        (t) =>
          t.planned_for_date === today &&
          matchesFilters(t, filters) &&
          matchesSearch(t, searchQuery, { projects, tags }),
      )
      .slice()
      .sort((a, b) => compareTodayOrder(a, b));
  }, [tasks, today, filters, searchQuery, projects, tags]);

  const openTasks = useMemo(
    () => tasksForToday.filter((t) => t.effective_status !== 'done'),
    [tasksForToday],
  );
  const doneTasks = useMemo(
    () => tasksForToday.filter((t) => t.effective_status === 'done'),
    [tasksForToday],
  );

  const totalCount = tasksForToday.length;
  const completedCount = doneTasks.length;
  const remainingCount = openTasks.length;
  const dayProgress =
    totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  // Time totals — sum estimated/total seconds across remaining vs done.
  const remainingEstSeconds = openTasks.reduce(
    (sum, t) => sum + (t.estimated_seconds ?? 0),
    0,
  );
  const trackedSecondsToday = tasksForToday.reduce(
    (sum, t) => sum + t.total_time_seconds + t.tracked_total_seconds,
    0,
  );

  // Drag-to-reorder over OPEN tasks only — done tasks sit below in a separate
  // dimmed group and can't be dragged (they've already happened).
  //
  // Feature 7 — a drag from the SearchResultsDropdown lands here too. Its
  // active.data.current.source is 'search' and the drop target is the
  // dedicated 'today-drop' zone (rendered as a wrapper around the day
  // section). In that case we append the task to today's sequence rather
  // than reordering the existing list.
  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;

    // Branch 1 — search → today: append to today's sequence.
    const isSearchDrag = active.data.current?.source === 'search';
    if (isSearchDrag && String(over.id) === 'today-drop') {
      await addTaskToToday(String(active.id), today);
      return;
    }

    // Branch 2 — sortable reorder within the open list.
    if (active.id === over.id) return;
    const ids = openTasks.map((t) => t.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const nextOrder = arrayMove(ids, from, to);
    // Done tasks keep their existing sequence and float to the bottom in the
    // UI sort. We only renumber the open set — but to keep today_sequence a
    // single coherent ordering, prepend the open-task order then append done
    // tasks in their current order.
    const doneIds = doneTasks
      .slice()
      .sort((a, b) => compareTodayOrder(a, b))
      .map((t) => t.id);
    await reorderToday(today, [...nextOrder, ...doneIds]);
  };

  // The "active black card" rule: when a session is running, find the task it
  // belongs to. Today renders that task as the dark card per the constraint
  // "only the actively-tracked task renders as a black card."
  const activelyTrackedTaskId = activeSessions[0]?.task_id ?? null;

  const handleStartNext = async () => {
    if (openTasks.length === 0) return;
    const target = openTasks[0];
    if (activelyTrackedTaskId === target.id) {
      // Already tracking — stop instead.
      const session = activeSessions.find((s) => s.task_id === target.id);
      if (session) await stopSession(session.id);
      return;
    }
    const mode = prefs?.default_timer_mode ?? 'open';
    const session = await startTrackingTask(target.id, null, mode);
    if (session && mode !== 'open') openFocusMode(session.id);
  };

  // Per-day "complete → next" choice (brief option B). On the first time a
  // task completes today, prompt; remember the answer for the rest of the day.
  const [nextActionPrompt, setNextActionPrompt] = useState<{
    completedTaskId: string;
  } | null>(null);

  const handleCheckOff = async (task: TaskType) => {
    const wasRunning = activeSessions.find((s) => s.task_id === task.id);
    if (wasRunning) await stopSession(wasRunning.id);
    await updateTask(task.id, {
      status: 'done',
      completed_at: new Date().toISOString(),
    });

    // Brief option B — prompt on first finish of the day, then remember.
    const remainingAfter = openTasks.filter((t) => t.id !== task.id);
    if (remainingAfter.length === 0) return; // nothing to do next anyway.

    const memo = readNextActionMemo(today);
    if (memo === 'manual') return;
    if (memo === 'auto_start') {
      // Auto-start the new top task — defer one tick so the store settles.
      setTimeout(() => {
        void (async () => {
          const next = remainingAfter[0];
          const mode = prefs?.default_timer_mode ?? 'open';
          const session = await startTrackingTask(next.id, null, mode);
          if (session && mode !== 'open') openFocusMode(session.id);
        })();
      }, 0);
      return;
    }
    setNextActionPrompt({ completedTaskId: task.id });
  };

  const handleUncheck = async (task: TaskType) => {
    await updateTask(task.id, { status: 'in_progress', completed_at: null });
  };

  const handleRemoveFromToday = async (task: TaskType) => {
    await updateTask(task.id, {
      planned_for_date: null,
      today_sequence: null,
    });
    showToast(`Removed "${task.title}" from today`);
  };

  const dateLabel = useMemo(
    () =>
      new Date(today + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    [today],
  );

  const startNextLabel =
    activelyTrackedTaskId && openTasks[0]?.id === activelyTrackedTaskId
      ? 'Pause task #1'
      : openTasks.length === 0
        ? 'Nothing to start'
        : 'Start task #1';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {/* Feature 7 — search results dropdown lives inside this DndContext so
          a draggable result row can be dropped onto the today-drop zone. */}
      <SearchResultsDropdown />

      <div className="flex items-end justify-between mb-4 mt-1 gap-3 flex-wrap">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-[-0.5px] text-[#1a1a2e] m-0">
            Today · {dateLabel}
          </h1>
          <p className="text-[12px] text-[#6b7280] mt-1 max-w-[520px] m-0">
            Drag to set your sequence. Task <b>#1 is what you do next.</b>{' '}
            Finish it, the next bubbles up.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[9px] tracking-[1px] text-[#9ca3af] font-bold uppercase">
              Est · Tracked
            </div>
            <div className="text-[13px] font-mono font-extrabold">
              {fmtShort(remainingEstSeconds)} ·{' '}
              <span className="text-[#1a1a2e]">
                {fmtShort(trackedSecondsToday)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStartNext}
            disabled={openTasks.length === 0}
            className="bg-[#1a1a2e] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[12px] font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-opacity cursor-pointer"
          >
            <span aria-hidden>▶</span>
            {startNextLabel}
          </button>
        </div>
      </div>

      <DayProgressBar
        completed={completedCount}
        total={totalCount}
        remainingTime={remainingEstSeconds}
        dayProgress={dayProgress}
        remainingCount={remainingCount}
      />

      <TodayDropZone>
        {tasksForToday.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2 mb-4 mt-3">
            <SortableContext
              items={openTasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {openTasks.map((task, index) => (
                <TodayRow
                  key={task.id}
                  task={task}
                  sequenceNumber={index + 1}
                  isNext={index === 0}
                  isActivelyTracked={activelyTrackedTaskId === task.id}
                  onPlay={handleStartNext}
                  onCheck={() => handleCheckOff(task)}
                  onRemove={() => handleRemoveFromToday(task)}
                />
              ))}
            </SortableContext>

            {doneTasks.length > 0 && (
              <div className="pt-3 mt-3 border-t border-dashed border-[#d1d5db]">
                <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#9ca3af] mb-2">
                  Done today · {doneTasks.length}
                </div>
                <div className="space-y-1">
                  {doneTasks.map((task) => (
                    <DoneRow
                      key={task.id}
                      task={task}
                      onUncheck={() => handleUncheck(task)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </TodayDropZone>

      <AddToTodayPanel today={today} />

      {nextActionPrompt && (
        <NextActionModal
          today={today}
          onClose={() => setNextActionPrompt(null)}
          onPick={async (choice, remember) => {
            if (remember) writeNextActionMemo(today, choice);
            setNextActionPrompt(null);
            if (choice === 'auto_start') {
              // Find the new top task and start it.
              const fresh = useStore.getState().tasks;
              const remaining = fresh
                .filter(
                  (t) =>
                    t.planned_for_date === today &&
                    t.effective_status !== 'done',
                )
                .slice()
                .sort(compareTodayOrder);
              const next = remaining[0];
              if (!next) return;
              const mode = prefs?.default_timer_mode ?? 'open';
              const session = await startTrackingTask(next.id, null, mode);
              if (session && mode !== 'open') openFocusMode(session.id);
            }
          }}
        />
      )}
    </DndContext>
  );
}

// Wrapper that registers the today section as a single drop target for the
// SearchResultsDropdown. Sortable reorder still happens inside this zone via
// the SortableContext below — the unified handleDragEnd routes by over.id.
function TodayDropZone({ children }: { children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'today-drop' });
  return (
    <div
      ref={setNodeRef}
      className="rounded-[14px] transition-colors"
      style={{
        outline: isOver ? '2px dashed #1a1a2e' : '2px dashed transparent',
        outlineOffset: 6,
      }}
    >
      {children}
    </div>
  );
}

// Sort: NULL today_sequence sinks to the bottom (within its group); within
// numbered tasks, ascending. Same comparator used by the row index and the
// reorder write so the two stay in sync.
function compareTodayOrder(a: TaskType, b: TaskType): number {
  const aSeq = a.today_sequence ?? Number.POSITIVE_INFINITY;
  const bSeq = b.today_sequence ?? Number.POSITIVE_INFINITY;
  if (aSeq !== bSeq) return aSeq - bSeq;
  return a.sort_order - b.sort_order;
}

function DayProgressBar({
  completed,
  total,
  remainingTime,
  dayProgress,
  remainingCount,
}: {
  completed: number;
  total: number;
  remainingTime: number;
  dayProgress: number;
  remainingCount: number;
}) {
  return (
    <div className="bg-white rounded-[14px] p-4 mb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold tracking-[1px] text-[#666] uppercase">
          Day progress
        </span>
        <span className="text-[11px] font-mono text-[#9ca3af]">
          {completed} of {total} done · {remainingCount} remaining
          {remainingTime > 0 ? ` · ~${fmtShort(remainingTime)} estimated` : ''}
        </span>
      </div>
      <div className="w-full h-[6px] bg-[rgba(0,0,0,0.06)] rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${dayProgress}%`,
            background: '#1a1a2e',
          }}
        />
      </div>
    </div>
  );
}

interface TodayRowProps {
  task: TaskType;
  sequenceNumber: number;
  isNext: boolean;
  isActivelyTracked: boolean;
  onPlay: () => void;
  onCheck: () => void;
  onRemove: () => void;
}

function TodayRow({
  task,
  sequenceNumber,
  isNext,
  isActivelyTracked,
  onPlay,
  onCheck,
  onRemove,
}: TodayRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
  const elapsedMap = useLiveTimers();
  const activeSessions = useStore((s) => s.activeSessions);
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
  const [editing, setEditing] = useState(false);

  const sessionsForTask = activeSessions.filter((s) => s.task_id === task.id);
  const liveElapsed = sessionsForTask.reduce(
    (sum, s) => sum + (elapsedMap[s.id] ?? 0),
    0,
  );
  const invested =
    task.total_time_seconds + task.tracked_total_seconds + liveElapsed;

  const taskProjects = task.project_ids
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const taskCategories = task.category_ids
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  // Active card = the only one rendered as the dark "Now Tracking" card.
  const darkCard = isActivelyTracked;

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={dragStyle}
        className="rounded-[14px] transition-shadow"
      >
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{
            background: darkCard ? '#1a1a2e' : '#fff',
            color: darkCard ? '#fff' : '#1a1a2e',
            border: darkCard
              ? '1px solid rgba(255,255,255,0.08)'
              : isNext
                ? '1.5px solid #1a1a2e'
                : '1px solid #e5e7eb',
            borderRadius: 14,
            boxShadow: darkCard
              ? '0 8px 30px rgba(0,0,0,0.2)'
              : isNext
                ? '0 4px 16px rgba(0,0,0,0.12)'
                : '0 1px 4px rgba(0,0,0,0.04)',
          }}
        >
          {/* Drag handle */}
          <button
            {...listeners}
            {...attributes}
            type="button"
            className="bg-transparent border-0 cursor-grab leading-none px-1 text-base"
            style={{ color: darkCard ? 'rgba(255,255,255,0.4)' : '#bbb' }}
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            ⋮⋮
          </button>

          {/* Sequence number badge */}
          <span
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[12px] font-extrabold shrink-0"
            style={{
              background: isNext
                ? '#1a1a2e'
                : darkCard
                  ? 'rgba(255,255,255,0.12)'
                  : 'rgba(0,0,0,0.06)',
              color: isNext ? '#fff' : darkCard ? '#fff' : '#666',
              outline: isNext && darkCard ? '2px solid #fff' : 'none',
            }}
            title={`Sequence ${sequenceNumber}`}
          >
            {sequenceNumber}
          </span>

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isNext && (
                <span
                  className="text-[9px] font-extrabold tracking-[1px] uppercase px-[6px] py-[2px] rounded"
                  style={{
                    background: darkCard ? '#fff' : '#1a1a2e',
                    color: darkCard ? '#1a1a2e' : '#fff',
                  }}
                >
                  Do next
                </span>
              )}
              <span
                className="text-[14px] font-bold truncate cursor-pointer"
                onClick={() => setEditing(true)}
                title="Edit task"
              >
                {task.title}
              </span>
            </div>
            <div className="flex items-center gap-[6px] flex-wrap mt-[4px]">
              <PriorityBadge priority={task.priority} />
              {taskCategories.map((c) => (
                <CategoryPill key={c.id} category={c} />
              ))}
              {taskProjects.map((p) => (
                <ProjectBadge key={p.id} project={p} />
              ))}
              {task.estimated_seconds && task.estimated_seconds > 0 && (
                <span
                  className="text-[10px] font-mono tracking-wider"
                  style={{
                    color: darkCard ? 'rgba(255,255,255,0.6)' : '#9ca3af',
                  }}
                  title={`Estimated ${fmtShort(task.estimated_seconds)}`}
                >
                  est {fmtShort(task.estimated_seconds)}
                </span>
              )}
              {invested > 0 && (
                <span
                  className="text-[11px] font-mono font-bold tabular-nums"
                  style={{
                    color: darkCard ? '#fff' : '#1a1a2e',
                  }}
                  title="Tracked time"
                >
                  {fmtShort(invested)}
                </span>
              )}
            </div>
          </div>

          {/* Play (next) or check button */}
          {isNext ? (
            <button
              type="button"
              onClick={onPlay}
              className="w-[34px] h-[34px] rounded-full border-0 cursor-pointer flex items-center justify-center text-[14px] font-bold shrink-0 transition-opacity hover:opacity-85"
              style={{
                background: darkCard ? '#fff' : '#1a1a2e',
                color: darkCard ? '#1a1a2e' : '#fff',
              }}
              title={
                isActivelyTracked
                  ? 'Pause this task'
                  : 'Start tracking task #1'
              }
              aria-label={
                isActivelyTracked ? 'Pause this task' : 'Start tracking task #1'
              }
            >
              {isActivelyTracked ? '⏸' : '▶'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onCheck}
              className="w-[26px] h-[26px] rounded-full border-[2px] cursor-pointer flex items-center justify-center text-[12px] shrink-0 transition-colors hover:bg-[rgba(0,0,0,0.04)]"
              style={{
                borderColor: '#c7c9d1',
                background: 'transparent',
                color: '#9ca3af',
              }}
              title="Mark as done"
              aria-label="Mark as done"
            >
              ✓
            </button>
          )}

          {/* Remove from today */}
          <button
            type="button"
            onClick={onRemove}
            className="bg-transparent border-0 cursor-pointer leading-none text-base shrink-0 hover:opacity-100"
            style={{
              color: darkCard ? 'rgba(255,255,255,0.35)' : '#ccc',
              opacity: 0.6,
            }}
            title="Remove from today"
            aria-label="Remove from today"
          >
            ×
          </button>

          {/* For the top row, also show a small check so users can mark task
              #1 done without first pausing — matches brief: "Finish it, the
              next bubbles up." */}
          {isNext && (
            <button
              type="button"
              onClick={onCheck}
              className="w-[26px] h-[26px] rounded-full border-[2px] cursor-pointer flex items-center justify-center text-[12px] shrink-0 hover:bg-[rgba(0,0,0,0.04)]"
              style={{
                borderColor: darkCard ? 'rgba(255,255,255,0.4)' : '#c7c9d1',
                background: 'transparent',
                color: darkCard ? 'rgba(255,255,255,0.7)' : '#9ca3af',
              }}
              title="Mark task #1 done"
              aria-label="Mark task #1 done"
            >
              ✓
            </button>
          )}
        </div>
      </div>

      {editing && (
        <EditTaskDrawer
          key={task.id}
          taskId={task.id}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

function DoneRow({
  task,
  onUncheck,
}: {
  task: TaskType;
  onUncheck: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-[6px] opacity-55">
      <button
        type="button"
        onClick={onUncheck}
        className="w-[20px] h-[20px] rounded-[6px] border-0 flex items-center justify-center text-white text-xs shrink-0 cursor-pointer"
        style={{ background: '#10b981' }}
        title="Move back to active"
        aria-label="Move back to active"
      >
        ✓
      </button>
      <span className="flex-1 text-[12px] line-through text-[#6b7280] truncate">
        {task.title}
      </span>
      {task.total_time_seconds + task.tracked_total_seconds > 0 && (
        <span className="text-[10px] font-mono text-[#9ca3af]">
          {fmtShort(task.total_time_seconds + task.tracked_total_seconds)}
        </span>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-[14px] p-10 text-center text-[#6b7280] shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] mb-4">
      <div className="text-[14px] font-semibold text-[#1a1a2e] mb-2">
        No tasks for today.
      </div>
      <div className="text-[12px]">
        Tap ⭐ on any task card to add it here, or use the +Add panel below.
      </div>
    </div>
  );
}

function AddToTodayPanel({ today }: { today: string }) {
  const setView = useStore((s) => s.setView);
  const tasks = useStore((s) => s.tasks);
  const addTaskToToday = useStore((s) => s.addTaskToToday);
  const [pickerOpen, setPickerOpen] = useState(false);

  const candidateCount = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.planned_for_date !== today &&
          t.effective_status !== 'done',
      ).length,
    [tasks, today],
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          type="button"
          onClick={() => setView('matrix')}
          className="bg-white rounded-[12px] px-4 py-3 text-[12px] text-[#6b7280] hover:text-[#1a1a2e] cursor-pointer transition-colors flex items-center justify-center gap-2"
          style={{ border: '1.5px dashed #c7c9d1' }}
        >
          <span aria-hidden>⊞</span> Pull from{' '}
          <b className="text-[#1a1a2e]">Matrix → Do First</b>
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          disabled={candidateCount === 0}
          className="bg-white rounded-[12px] px-4 py-3 text-[12px] text-[#6b7280] hover:text-[#1a1a2e] cursor-pointer transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ border: '1.5px dashed #c7c9d1' }}
        >
          <span aria-hidden>+</span> Add an existing task to today
          {candidateCount > 0 && (
            <span className="text-[10px] text-[#9ca3af]">
              ({candidateCount} available)
            </span>
          )}
        </button>
      </div>

      {pickerOpen && (
        <TaskPicker
          today={today}
          onPick={async (taskId) => {
            await addTaskToToday(taskId, today);
            setPickerOpen(false);
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      <div
        className="rounded-[12px] p-3 text-[12px] text-[#666] flex items-start gap-2"
        style={{
          background: 'rgba(26,26,46,0.04)',
          border: '1px solid rgba(26,26,46,0.08)',
        }}
      >
        <span aria-hidden className="text-base leading-none">💡</span>
        <span>
          <b className="text-[#1a1a2e]">Today is for sequence.</b> Drag to
          decide order. Matrix (coming soon) is for{' '}
          <i>which tasks matter strategically</i>; this view is for{' '}
          <i>which order to do them in today</i>.
        </span>
      </div>
    </>
  );
}

function TaskPicker({
  today,
  onPick,
  onCancel,
}: {
  today: string;
  onPick: (taskId: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const [query, setQuery] = useState('');

  const candidates = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.planned_for_date !== today &&
            t.effective_status !== 'done' &&
            t.title.toLowerCase().includes(query.toLowerCase()),
        )
        .slice()
        .sort((a, b) => {
          const p = priorityRank(b.priority) - priorityRank(a.priority);
          return p !== 0 ? p : a.sort_order - b.sort_order;
        })
        .slice(0, 30),
    [tasks, today, query],
  );

  return (
    <div className="bg-white rounded-[12px] mb-3 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#eee]">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks…"
          className="flex-1 border-0 px-1 py-1 text-[13px] outline-none bg-transparent"
        />
        <button
          type="button"
          onClick={onCancel}
          className="bg-transparent border-0 text-[#9ca3af] cursor-pointer text-base leading-none hover:text-[#1a1a2e]"
          aria-label="Close picker"
        >
          ×
        </button>
      </div>
      <div className="max-h-[280px] overflow-y-auto">
        {candidates.length === 0 ? (
          <div className="text-center py-4 text-[#9ca3af] text-[12px]">
            {query
              ? 'No matching tasks.'
              : 'No tasks available — try adding a new one above.'}
          </div>
        ) : (
          candidates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void onPick(t.id)}
              className="w-full text-left px-3 py-[8px] text-[13px] text-[#1a1a2e] bg-transparent border-0 cursor-pointer hover:bg-[rgba(0,0,0,0.04)] flex items-center gap-2"
            >
              <span className="inline-block text-[9px] font-extrabold uppercase px-[5px] py-[1px] rounded bg-black/[.06] text-[#666]">
                {t.priority}
              </span>
              <span className="truncate flex-1">{t.title}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function priorityRank(p: TaskType['priority']): number {
  switch (p) {
    case 'urgent':
      return 3;
    case 'high':
      return 2;
    case 'medium':
      return 1;
    default:
      return 0;
  }
}

// "What's next?" modal — fires once on the day's first finish unless the user
// previously picked auto_start or manual.
function NextActionModal({
  today,
  onClose,
  onPick,
}: {
  today: string;
  onClose: () => void;
  onPick: (choice: NextAction, remember: boolean) => void | Promise<void>;
}) {
  const [remember, setRemember] = useState(false);
  // Silence unused warning — `today` is here for future telemetry / debug.
  void today;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[16px] p-5 max-w-[420px] w-[92%] shadow-[0_20px_50px_rgba(0,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="What's next?"
      >
        <div className="text-[16px] font-extrabold text-[#1a1a2e] mb-1">
          Task done. What now?
        </div>
        <div className="text-[12px] text-[#6b7280] mb-4">
          Pick once and we&apos;ll remember for the rest of today.
        </div>
        <div className="flex flex-col gap-2 mb-4">
          <button
            type="button"
            onClick={() => void onPick('auto_start', remember)}
            className="px-4 py-2 rounded-lg text-left text-[13px] font-bold border-0 cursor-pointer text-white"
            style={{ background: '#1a1a2e' }}
          >
            ▶ Start task #2 now
            <div className="text-[11px] font-normal opacity-70 mt-[2px]">
              Aggressive momentum — auto-track the next task.
            </div>
          </button>
          <button
            type="button"
            onClick={() => void onPick('manual', remember)}
            className="px-4 py-2 rounded-lg text-left text-[13px] font-bold border-[1.5px] border-[#e5e7eb] bg-white cursor-pointer hover:border-[#1a1a2e]"
          >
            ☕ Take a break
            <div className="text-[11px] font-normal text-[#6b7280] mt-[2px]">
              Stop here. I&apos;ll tap play when I&apos;m ready.
            </div>
          </button>
          <button
            type="button"
            onClick={() => void onPick('manual', remember)}
            className="px-4 py-2 rounded-lg text-left text-[13px] font-bold border-[1.5px] border-[#e5e7eb] bg-white cursor-pointer hover:border-[#1a1a2e]"
          >
            ✎ Pick a different task
            <div className="text-[11px] font-normal text-[#6b7280] mt-[2px]">
              Browse the list and start something else.
            </div>
          </button>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[#6b7280] cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="accent-[#1a1a2e]"
          />
          Remember my choice for today
        </label>
      </div>
    </div>
  );
}
