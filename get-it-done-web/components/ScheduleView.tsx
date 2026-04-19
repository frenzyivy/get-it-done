'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useStore } from '@/lib/store';
import { fmtShort } from '@/lib/utils';
import type { PlannedBlock, SubtaskType, TagType, TaskType } from '@/types';

const HOUR_HEIGHT = 56; // px per hour row
const START_HOUR = 6;
const END_HOUR = 23; // exclusive — shows up to 22:00 slot
const SNAP_MINUTES = 15; // resize snap granularity
const MIN_BLOCK_SECONDS = 15 * 60;
const DEFAULT_BLOCK_SECONDS = 30 * 60;
const DURATION_PRESETS_MIN = [15, 30, 45, 60, 90, 120, 180] as const;

// v2 spec §8 — Schedule view. Drag tasks from the side panel onto the grid
// to create 60-minute time blocks. The NOW line updates every minute.
export function ScheduleView() {
  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const addPlannedBlock = useStore((s) => s.addPlannedBlock);
  const updatePlannedBlock = useStore((s) => s.updatePlannedBlock);
  const deletePlannedBlock = useStore((s) => s.deletePlannedBlock);
  const tags = useStore((s) => s.tags);
  const userId = useStore((s) => s.userId);

  const [now, setNow] = useState(() => new Date());

  // Always render today for M3. Date picker can wire a selected-date state later.
  const dayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const dayEnd = useMemo(() => {
    const d = new Date(dayStart);
    d.setDate(d.getDate() + 1);
    return d;
  }, [dayStart]);

  useEffect(() => {
    if (!userId) return;
    void fetchPlannedBlocks(dayStart.toISOString(), dayEnd.toISOString());
  }, [userId, fetchPlannedBlocks, dayStart, dayEnd]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Only show tasks that aren't done (can't plan the past).
  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done'),
    [tasks],
  );

  // Map hour → blocks starting in that hour (for positioning)
  const blocksByHour = useMemo(() => {
    const m = new Map<number, PlannedBlock[]>();
    for (const b of plannedBlocks) {
      const h = new Date(b.start_at).getHours();
      const arr = m.get(h) ?? [];
      arr.push(b);
      m.set(h, arr);
    }
    return m;
  }, [plannedBlocks]);

  const nowWithinGrid =
    now >= dayStart &&
    now < dayEnd &&
    now.getHours() >= START_HOUR &&
    now.getHours() < END_HOUR;
  const nowOffsetPx =
    (now.getHours() - START_HOUR) * HOUR_HEIGHT +
    (now.getMinutes() / 60) * HOUR_HEIGHT;

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const activeId = String(e.active.id);
    const targetHour = Number(String(e.over.id).replace('hour-', ''));

    // Drag IDs: `task__<taskId>` or `subtask__<taskId>__<subtaskId>`.
    // Use `__` because task/subtask IDs are UUIDs and contain hyphens.
    let taskId: string;
    let subtaskId: string | null = null;
    if (activeId.startsWith('subtask__')) {
      const rest = activeId.slice('subtask__'.length);
      const sep = rest.indexOf('__');
      if (sep === -1) return;
      taskId = rest.slice(0, sep);
      subtaskId = rest.slice(sep + 2);
    } else if (activeId.startsWith('task__')) {
      taskId = activeId.slice('task__'.length);
    } else {
      return;
    }
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (subtaskId && !task.subtasks.some((s) => s.id === subtaskId)) return;

    const startAt = new Date(dayStart);
    startAt.setHours(targetHour, 0, 0, 0);
    void addPlannedBlock({
      task_id: task.id,
      subtask_id: subtaskId,
      start_at: startAt.toISOString(),
      duration_seconds: DEFAULT_BLOCK_SECONDS,
      block_type: 'work',
      notes: null,
    });
  };

  const plannedSeconds = plannedBlocks.reduce((s, b) => s + b.duration_seconds, 0);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-[1fr_240px] gap-4">
        {/* Grid */}
        <div className="bg-white rounded-[14px] shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#eee] flex items-center justify-between">
            <div className="text-[13px] font-extrabold uppercase tracking-[0.5px] text-[#1a1a2e]">
              {dayStart.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
            </div>
            <div className="text-[12px] text-[#666]">
              Planned: <span className="font-bold text-[#8b5cf6]">{fmtShort(plannedSeconds)}</span>
            </div>
          </div>
          <div className="relative">
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i).map((h) => (
              <HourRow
                key={h}
                hour={h}
                blocks={blocksByHour.get(h) ?? []}
                tasks={tasks}
                tags={tags}
                onDelete={deletePlannedBlock}
                onUpdate={updatePlannedBlock}
              />
            ))}
            {nowWithinGrid && (
              <div
                className="absolute left-[56px] right-2 h-[2px] bg-[#dc2626] pointer-events-none z-10"
                style={{ top: nowOffsetPx }}
              >
                <div className="absolute -left-1 -top-[4px] w-[10px] h-[10px] rounded-full bg-[#dc2626]" />
                <div className="absolute -right-[44px] -top-[10px] text-[10px] font-bold text-[#dc2626]">
                  {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Task palette */}
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#888] mb-2">
            Drag a task →
          </div>
          <div className="flex flex-col gap-[6px] max-h-[calc(100vh-200px)] overflow-y-auto">
            {openTasks.length === 0 && (
              <div className="text-[12px] text-[#aaa] py-4 text-center">
                No open tasks. Add one on the Board.
              </div>
            )}
            {openTasks.map((t) => (
              <DraggableTaskWithSubtasks key={t.id} task={t} tags={tags} />
            ))}
          </div>
        </div>
      </div>
    </DndContext>
  );
}

function HourRow({
  hour,
  blocks,
  tasks,
  tags,
  onDelete,
  onUpdate,
}: {
  hour: number;
  blocks: PlannedBlock[];
  tasks: TaskType[];
  tags: TagType[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PlannedBlock>) => Promise<void>;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `hour-${hour}` });
  return (
    <div className="flex" style={{ height: HOUR_HEIGHT }}>
      <div className="w-[56px] border-r border-[#eee] text-[11px] text-[#888] px-2 py-1">
        {String(hour).padStart(2, '0')}:00
      </div>
      <div
        ref={setNodeRef}
        className="flex-1 relative border-b border-dashed border-[#eee] transition-colors"
        style={{
          background: isOver ? 'rgba(139,92,246,0.06)' : 'transparent',
          overflow: 'visible',
        }}
      >
        {blocks.map((b) => (
          <BlockCard
            key={b.id}
            block={b}
            tasks={tasks}
            tags={tags}
            hour={hour}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  );
}

function BlockCard({
  block,
  tasks,
  tags,
  hour,
  onDelete,
  onUpdate,
}: {
  block: PlannedBlock;
  tasks: TaskType[];
  tags: TagType[];
  hour: number;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PlannedBlock>) => Promise<void>;
}) {
  const start = new Date(block.start_at);
  const task = tasks.find((t) => t.id === block.task_id);
  const subtask = block.subtask_id
    ? task?.subtasks.find((s) => s.id === block.subtask_id) ?? null
    : null;
  const tagColor =
    (task?.tag_ids[0] &&
      tags.find((x) => x.id === task.tag_ids[0])?.color) ||
    '#8b5cf6';

  // Local override while resizing so the UI feels instant.
  const [liveDuration, setLiveDuration] = useState<number | null>(null);
  const effectiveDuration = liveDuration ?? block.duration_seconds;
  const [menuOpen, setMenuOpen] = useState(false);

  const topPx = (start.getMinutes() / 60) * HOUR_HEIGHT;
  const heightPx = Math.max(14, (effectiveDuration / 3600) * HOUR_HEIGHT);
  const endMinutes = start.getMinutes() + effectiveDuration / 60;
  const endHour = hour + Math.floor(endMinutes / 60);
  const endMin = Math.floor(endMinutes % 60);

  const primaryLabel = subtask?.title ?? task?.title ?? 'Untitled block';
  const secondaryLabel = subtask ? task?.title ?? null : null;

  const commitDuration = useCallback(
    (seconds: number) => {
      const clamped = Math.max(MIN_BLOCK_SECONDS, seconds);
      if (clamped === block.duration_seconds) return;
      void onUpdate(block.id, { duration_seconds: clamped });
    },
    [block.id, block.duration_seconds, onUpdate],
  );

  const bumpDuration = (deltaMinutes: number) => {
    const next = effectiveDuration + deltaMinutes * 60;
    commitDuration(next);
  };

  // Drag the bottom edge to resize, like Google Calendar.
  const dragStateRef = useRef<{ startY: number; startSec: number } | null>(null);
  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = { startY: e.clientY, startSec: effectiveDuration };
  };
  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st) return;
    const deltaPx = e.clientY - st.startY;
    const deltaSec = (deltaPx / HOUR_HEIGHT) * 3600;
    const snap = SNAP_MINUTES * 60;
    const snapped = Math.round((st.startSec + deltaSec) / snap) * snap;
    setLiveDuration(Math.max(MIN_BLOCK_SECONDS, snapped));
  };
  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    dragStateRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
    if (!st) return;
    const finalSec = liveDuration ?? st.startSec;
    setLiveDuration(null);
    commitDuration(finalSec);
  };

  return (
    <div
      className="absolute left-1 right-1 rounded-lg bg-[rgba(139,92,246,0.08)] border-l-[3px] px-2 py-1 group z-[1] hover:z-[2]"
      style={{
        top: topPx,
        height: heightPx - 2,
        borderLeftColor: tagColor,
      }}
      title={subtask ? `${task?.title ?? ''} — ${subtask.title}` : task?.title ?? 'Untitled'}
    >
      <div className="text-[11px] font-bold text-[#1a1a2e] truncate pr-14">
        {primaryLabel}
      </div>
      {secondaryLabel && heightPx > 34 && (
        <div className="text-[10px] text-[#888] truncate">↳ {secondaryLabel}</div>
      )}
      <div className="text-[10px] text-[#888]">
        {String(hour).padStart(2, '0')}:{String(start.getMinutes()).padStart(2, '0')} →{' '}
        {String(endHour).padStart(2, '0')}:{String(endMin).padStart(2, '0')}
        <span className="ml-1 text-[#bbb]">· {Math.round(effectiveDuration / 60)}m</span>
      </div>

      {/* Top-right controls: up/down arrows + edit + delete */}
      <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            bumpDuration(-SNAP_MINUTES);
          }}
          title="Shorten by 15m"
          className="w-5 h-5 flex items-center justify-center text-[10px] text-[#666] hover:text-[#1a1a2e] bg-white/70 hover:bg-white rounded border border-[#eee] cursor-pointer"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            bumpDuration(SNAP_MINUTES);
          }}
          title="Extend by 15m"
          className="w-5 h-5 flex items-center justify-center text-[10px] text-[#666] hover:text-[#1a1a2e] bg-white/70 hover:bg-white rounded border border-[#eee] cursor-pointer"
        >
          ▼
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          title="Edit duration"
          className="w-5 h-5 flex items-center justify-center text-[10px] text-[#666] hover:text-[#1a1a2e] bg-white/70 hover:bg-white rounded border border-[#eee] cursor-pointer"
        >
          ✎
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(block.id);
          }}
          title="Remove from timeline"
          className="w-5 h-5 flex items-center justify-center text-[10px] text-[#ccc] hover:text-[#dc2626] bg-white/70 hover:bg-white rounded border border-[#eee] cursor-pointer"
        >
          ×
        </button>
      </div>

      {/* Inline duration menu */}
      {menuOpen && (
        <div
          className="absolute right-1 top-7 z-20 bg-white rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] py-1 flex flex-col min-w-[110px]"
          onClick={(e) => e.stopPropagation()}
        >
          {DURATION_PRESETS_MIN.map((m) => {
            const active = Math.round(effectiveDuration / 60) === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  commitDuration(m * 60);
                  setMenuOpen(false);
                }}
                className="text-[11px] text-left px-3 py-1 hover:bg-[#f5f3ff] cursor-pointer bg-transparent border-0"
                style={{ color: active ? '#8b5cf6' : '#1a1a2e', fontWeight: active ? 700 : 400 }}
              >
                {m < 60 ? `${m} min` : m === 60 ? '1 hour' : `${m / 60} hours`}
              </button>
            );
          })}
        </div>
      )}

      {/* Resize handle */}
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        className="absolute left-0 right-0 bottom-0 h-[6px] cursor-ns-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to resize"
      >
        <div className="w-8 h-[3px] rounded-full bg-[#8b5cf6]/60" />
      </div>
    </div>
  );
}

function DraggableTaskWithSubtasks({
  task,
  tags,
}: {
  task: TaskType;
  tags: TagType[];
}) {
  const openSubtasks = task.subtasks
    .filter((s) => !s.is_done)
    .sort((a, b) => a.sort_order - b.sort_order);
  const [expanded, setExpanded] = useState(false);
  const firstTag = tags.find((t) => t.id === task.tag_ids[0]);
  const accent = firstTag?.color ?? '#8b5cf6';
  const hasSubtasks = openSubtasks.length > 0;

  return (
    <div
      className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05),0_0_0_1px_rgba(0,0,0,0.04)] overflow-hidden"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-1 pl-1 pr-2 py-1">
        <button
          type="button"
          onClick={() => hasSubtasks && setExpanded((v) => !v)}
          disabled={!hasSubtasks}
          className="w-5 h-5 flex items-center justify-center text-[11px] text-[#888] hover:text-[#1a1a2e] rounded bg-transparent border-0 shrink-0"
          style={{ cursor: hasSubtasks ? 'pointer' : 'default', opacity: hasSubtasks ? 1 : 0.3 }}
          title={hasSubtasks ? (expanded ? 'Hide subtasks' : 'Show subtasks') : 'No open subtasks'}
          aria-label="Toggle subtasks"
        >
          {expanded ? '▾' : '▸'}
        </button>
        <DraggableTaskHandle taskId={task.id} title={task.title} tagLabel={firstTag} />
        {hasSubtasks && (
          <span className="text-[10px] text-[#888] shrink-0 px-1">
            {openSubtasks.length}
          </span>
        )}
      </div>
      {expanded && hasSubtasks && (
        <div className="flex flex-col gap-[4px] px-2 pb-2 pl-6 border-t border-dashed border-[#eee] pt-2">
          {openSubtasks.map((s) => (
            <DraggableSubtask key={s.id} taskId={task.id} subtask={s} accent={accent} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraggableTaskHandle({
  taskId,
  title,
  tagLabel,
}: {
  taskId: string;
  title: string;
  tagLabel: TagType | undefined;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task__${taskId}`,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="flex-1 min-w-0"
      style={{ cursor: 'grab', opacity: isDragging ? 0.4 : 1, touchAction: 'none' }}
    >
      <div className="text-[12px] font-semibold text-[#1a1a2e] truncate">
        {title}
      </div>
      {tagLabel && (
        <div className="text-[10px] mt-0.5" style={{ color: tagLabel.color }}>
          {tagLabel.name}
        </div>
      )}
    </div>
  );
}

function DraggableSubtask({
  taskId,
  subtask,
  accent,
}: {
  taskId: string;
  subtask: SubtaskType;
  accent: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `subtask__${taskId}__${subtask.id}`,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="text-[11px] text-[#1a1a2e] bg-[#fafafa] hover:bg-[#f3f0ff] rounded px-2 py-1 flex items-center gap-2"
      style={{
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        touchAction: 'none',
      }}
      title={`Drag subtask: ${subtask.title}`}
    >
      <span
        className="inline-block w-[6px] h-[6px] rounded-full shrink-0"
        style={{ background: accent }}
      />
      <span className="truncate">{subtask.title}</span>
    </div>
  );
}
