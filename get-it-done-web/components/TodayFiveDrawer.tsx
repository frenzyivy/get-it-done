'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
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
import { todayISO } from '@/lib/utils';
import type { Status, TaskType } from '@/types';

// "Today's 5" — drawer that lists the user's picks for today. Top 5 by
// sort_order are "today's 5"; anything beyond sits in a waiting list that the
// user can promote by dragging it above the cut-off.
interface Props {
  onClose: () => void;
}

const DAILY_CAP = 5;

export function TodayFiveDrawer({ onClose }: Props) {
  const tasks = useStore((s) => s.tasks);
  const updateTask = useStore((s) => s.updateTask);
  const setPlannedForDateBulk = useStore((s) => s.setPlannedForDateBulk);

  const today = todayISO();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const planned = useMemo(
    () =>
      tasks
        .filter((t) => t.planned_for_date === today)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order),
    [tasks, today],
  );

  const completed = planned.slice(0, DAILY_CAP).filter((t) => t.status === 'done').length;

  const [pickerOpen, setPickerOpen] = useState(false);

  const handleStatusToggle = async (t: TaskType) => {
    const next: Status = t.status === 'done' ? 'in_progress' : 'done';
    await updateTask(t.id, { status: next });
  };

  const handleRemove = async (t: TaskType) => {
    await updateTask(t.id, { planned_for_date: null });
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = planned.map((t) => t.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const nextOrder = arrayMove(ids, from, to);
    // Namespace sort_order within today's planned set by reading the min
    // currently used and rewriting the block contiguously.
    const minOrder = Math.min(...planned.map((t) => t.sort_order));
    await Promise.all(
      nextOrder.map((id, i) =>
        updateTask(id, { sort_order: minOrder + i }),
      ),
    );
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30 animate-[fadeIn_0.15s_ease-out]"
      />
      <aside
        className="fixed top-0 right-0 z-50 h-screen w-full sm:w-[460px] bg-white shadow-[-8px_0_30px_rgba(0,0,0,0.12)] flex flex-col animate-[slideInRight_0.2s_ease-out]"
        role="dialog"
        aria-label="Today's 5"
      >
        <div className="px-5 py-4 border-b border-[#eee] flex items-center justify-between">
          <div>
            <div className="text-[13px] font-extrabold uppercase tracking-[0.5px] text-[#1a1a2e]">
              Today&apos;s 5
            </div>
            <div className="text-[11px] text-[#888] mt-[2px]">
              {completed} / {DAILY_CAP} done
              {planned.length > DAILY_CAP &&
                ` · ${planned.length - DAILY_CAP} queued`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-0 text-[#aaa] hover:text-[#1a1a2e] cursor-pointer text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {planned.length === 0 ? (
            <div className="text-center py-10 text-[#aaa] text-sm">
              Nothing picked for today yet. Tap ⭐ on a task card, or add one
              below.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={planned.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-1">
                  {planned.map((t, i) => (
                    <SortableTaskRow
                      key={t.id}
                      task={t}
                      isInTopFive={i < DAILY_CAP}
                      isCutoff={i === DAILY_CAP - 1 && planned.length > DAILY_CAP}
                      onToggle={() => handleStatusToggle(t)}
                      onRemove={() => handleRemove(t)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {planned.length > DAILY_CAP && (
            <div className="text-[11px] text-[#888] italic mt-2">
              Drag a queued task above the line to promote it into today&apos;s 5.
            </div>
          )}

          {/* Picker for empty slots */}
          {planned.length < DAILY_CAP && (
            <div className="mt-2">
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="w-full border-[1.5px] border-dashed border-[#c4b5fd] bg-[rgba(139,92,246,0.04)] text-[#8b5cf6] text-[13px] font-bold px-3 py-2 rounded-lg cursor-pointer hover:bg-[rgba(139,92,246,0.08)]"
              >
                + Add a task to today ({DAILY_CAP - planned.length} slot
                {DAILY_CAP - planned.length === 1 ? '' : 's'} left)
              </button>
              {pickerOpen && (
                <TaskPicker
                  excludeDate={today}
                  onPick={async (taskId) => {
                    // Append to the end of today's block.
                    const maxOrder = planned.length
                      ? Math.max(...planned.map((t) => t.sort_order))
                      : 0;
                    await setPlannedForDateBulk([
                      { id: taskId, planned_for_date: today },
                    ]);
                    await updateTask(taskId, { sort_order: maxOrder + 1 });
                    setPickerOpen(false);
                  }}
                />
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function SortableTaskRow({
  task,
  isInTopFive,
  isCutoff,
  onToggle,
  onRemove,
}: {
  task: TaskType;
  isInTopFive: boolean;
  isCutoff: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <>
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1,
        }}
        className="flex items-center gap-2 px-3 py-[8px] rounded-lg group"
        data-in-top-five={isInTopFive}
      >
        <button
          {...listeners}
          {...attributes}
          className="text-[#bbb] hover:text-[#888] cursor-grab bg-transparent border-0 px-1 leading-none"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          ⋮⋮
        </button>
        <button
          onClick={onToggle}
          className="w-[20px] h-[20px] rounded-[6px] flex items-center justify-center text-white text-xs shrink-0 transition-all cursor-pointer"
          style={{
            border: task.status === 'done' ? 'none' : '2px solid #ccc',
            background: task.status === 'done' ? '#10b981' : 'transparent',
          }}
          title={task.status === 'done' ? 'Mark as in progress' : 'Mark as done'}
          aria-label={task.status === 'done' ? 'Mark as in progress' : 'Mark as done'}
        >
          {task.status === 'done' ? '✓' : ''}
        </button>
        <span
          className={`flex-1 text-[13px] truncate ${
            task.status === 'done' ? 'line-through text-[#aaa]' : 'text-[#1a1a2e]'
          } ${isInTopFive ? 'font-bold' : 'text-[#666]'}`}
          style={{ background: isInTopFive ? 'transparent' : '#fafafa' }}
        >
          {task.title}
        </span>
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 text-[#ccc] hover:text-[#dc2626] bg-transparent border-0 text-sm cursor-pointer leading-none px-1"
          title="Remove from today"
          aria-label="Remove from today"
        >
          🗑
        </button>
      </div>
      {isCutoff && (
        <div className="flex items-center gap-2 mt-1 mb-1">
          <div className="flex-1 h-[1px] bg-[#ddd]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#888]">
            Top {DAILY_CAP} · below is waiting list
          </span>
          <div className="flex-1 h-[1px] bg-[#ddd]" />
        </div>
      )}
    </>
  );
}

// Mini picker listing candidate tasks (not already planned for `excludeDate`).
function TaskPicker({
  excludeDate,
  onPick,
}: {
  excludeDate: string;
  onPick: (taskId: string) => void | Promise<void>;
}) {
  const tasks = useStore((s) => s.tasks);
  const [query, setQuery] = useState('');
  const candidates = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.planned_for_date !== excludeDate &&
            t.status !== 'done' &&
            t.title.toLowerCase().includes(query.toLowerCase()),
        )
        .slice()
        .sort((a, b) => {
          const p = priorityRank(b.priority) - priorityRank(a.priority);
          return p !== 0 ? p : a.sort_order - b.sort_order;
        })
        .slice(0, 20),
    [tasks, excludeDate, query],
  );

  return (
    <div className="mt-2 bg-white rounded-lg border-[1.5px] border-[#e5e7eb] shadow-sm overflow-hidden">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tasks…"
        className="w-full border-0 border-b-[1px] border-[#eee] px-3 py-2 text-[13px] outline-none"
      />
      <div className="max-h-[240px] overflow-y-auto">
        {candidates.length === 0 ? (
          <div className="text-center py-4 text-[#aaa] text-[12px]">
            No matching tasks.
          </div>
        ) : (
          candidates.map((t) => (
            <button
              key={t.id}
              onClick={() => void onPick(t.id)}
              className="w-full text-left px-3 py-2 text-[13px] text-[#1a1a2e] bg-transparent border-0 cursor-pointer hover:bg-black/[.04]"
            >
              <span className="inline-block mr-2 text-[10px] font-bold uppercase px-[5px] py-[1px] rounded bg-black/[.06] text-[#666]">
                {t.priority}
              </span>
              {t.title}
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
