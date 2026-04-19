'use client';

import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { KANBAN_COLS } from '@/lib/constants';
import { TaskCard } from './TaskCard';
import { AddTaskForm } from './AddTaskForm';
import type { TaskType } from '@/types';

type Column = (typeof KANBAN_COLS)[number];

function DraggableCard({ task }: { task: TaskType }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { taskId: task.id },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
        touchAction: 'none',
      }}
    >
      <TaskCard task={task} compact />
    </div>
  );
}

interface Props {
  col: Column;
  tasks: TaskType[];
}

export function KanbanColumn({ col, tasks }: Props) {
  const { isOver, setNodeRef } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      className="rounded-2xl p-[14px] transition-colors"
      style={{
        background: isOver ? 'rgba(139,92,246,0.06)' : 'rgba(0,0,0,0.02)',
        border: isOver
          ? '2px dashed rgba(139,92,246,0.3)'
          : '2px dashed transparent',
      }}
    >
      <div className="flex items-center gap-2 mb-[14px] px-1">
        <span className="text-base">{col.icon}</span>
        <span
          className="font-extrabold text-[13px] uppercase tracking-[0.5px]"
          style={{ color: col.accent }}
        >
          {col.label}
        </span>
        <span
          className="ml-auto text-xs font-bold rounded-full w-[22px] h-[22px] flex items-center justify-center"
          style={{ background: col.accent + '18', color: col.accent }}
        >
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-[10px]">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} />
        ))}
        {tasks.length === 0 && (
          <p className="text-center text-[12px] text-[#9ca3af] py-2">
            No tasks yet
          </p>
        )}
        <AddTaskForm defaultStatus={col.id} />
      </div>
    </div>
  );
}
