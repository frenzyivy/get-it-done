'use client';

import { useEffect, useMemo, useState } from 'react';
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
import type { PlannedBlock, TagType, TaskType } from '@/types';

const HOUR_HEIGHT = 56; // px per hour row
const START_HOUR = 6;
const END_HOUR = 23; // exclusive — shows up to 22:00 slot

// v2 spec §8 — Schedule view. Drag tasks from the side panel onto the grid
// to create 60-minute time blocks. The NOW line updates every minute.
export function ScheduleView() {
  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const addPlannedBlock = useStore((s) => s.addPlannedBlock);
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
    const taskId = String(e.active.id).replace('task-', '');
    const targetHour = Number(String(e.over.id).replace('hour-', ''));
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const startAt = new Date(dayStart);
    startAt.setHours(targetHour, 0, 0, 0);
    void addPlannedBlock({
      task_id: task.id,
      subtask_id: null,
      start_at: startAt.toISOString(),
      duration_seconds: 60 * 60, // default 1 hour; resize in v2.1
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
              <HourRow key={h} hour={h} blocks={blocksByHour.get(h) ?? []} tasks={tasks} tags={tags} onDelete={deletePlannedBlock} />
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
              <DraggableTask key={t.id} task={t} tags={tags} />
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
}: {
  hour: number;
  blocks: PlannedBlock[];
  tasks: TaskType[];
  tags: TagType[];
  onDelete: (id: string) => void;
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
        style={{ background: isOver ? 'rgba(139,92,246,0.06)' : 'transparent' }}
      >
        {blocks.map((b) => (
          <BlockCard key={b.id} block={b} tasks={tasks} tags={tags} hour={hour} onDelete={onDelete} />
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
}: {
  block: PlannedBlock;
  tasks: TaskType[];
  tags: TagType[];
  hour: number;
  onDelete: (id: string) => void;
}) {
  const start = new Date(block.start_at);
  const task = tasks.find((t) => t.id === block.task_id);
  const tagColor =
    (task?.tag_ids[0] &&
      tags.find((x) => x.id === task.tag_ids[0])?.color) ||
    '#8b5cf6';

  const topPx = (start.getMinutes() / 60) * HOUR_HEIGHT;
  const heightPx = (block.duration_seconds / 3600) * HOUR_HEIGHT;
  const endMinutes = start.getMinutes() + block.duration_seconds / 60;
  const endHour = hour + Math.floor(endMinutes / 60);
  const endMin = Math.floor(endMinutes % 60);

  return (
    <div
      className="absolute left-1 right-1 rounded-lg bg-[rgba(139,92,246,0.08)] border-l-[3px] px-2 py-1 cursor-pointer group"
      style={{
        top: topPx,
        height: heightPx - 2,
        borderLeftColor: tagColor,
      }}
      title={task?.title ?? 'Untitled'}
    >
      <div className="text-[11px] font-bold text-[#1a1a2e] truncate">
        {task?.title ?? 'Untitled block'}
      </div>
      <div className="text-[10px] text-[#888]">
        {String(hour).padStart(2, '0')}:{String(start.getMinutes()).padStart(2, '0')} →{' '}
        {String(endHour).padStart(2, '0')}:{String(endMin).padStart(2, '0')}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(block.id);
        }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-[#ccc] hover:text-[#dc2626] text-xs bg-transparent border-0 cursor-pointer"
      >
        ×
      </button>
    </div>
  );
}

function DraggableTask({
  task,
  tags,
}: {
  task: TaskType;
  tags: { id: string; name: string; color: string }[];
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-${task.id}`,
  });
  const firstTag = tags.find((t) => t.id === task.tag_ids[0]);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="bg-white rounded-lg px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_0_0_1px_rgba(0,0,0,0.04)]"
      style={{
        borderLeft: `3px solid ${firstTag?.color ?? '#8b5cf6'}`,
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        touchAction: 'none',
      }}
    >
      <div className="text-[12px] font-semibold text-[#1a1a2e] truncate">
        {task.title}
      </div>
      {firstTag && (
        <div className="text-[10px] mt-1" style={{ color: firstTag.color }}>
          {firstTag.name}
        </div>
      )}
    </div>
  );
}
