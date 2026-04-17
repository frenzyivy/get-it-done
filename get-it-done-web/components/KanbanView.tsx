'use client';

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useStore } from '@/lib/store';
import { KANBAN_COLS } from '@/lib/constants';
import { KanbanColumn } from './KanbanColumn';
import type { Status } from '@/types';

export function KanbanView() {
  const tasks = useStore((s) => s.tasks);
  const moveTask = useStore((s) => s.moveTask);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const taskId = String(e.active.id);
    const newStatus = String(e.over.id) as Status;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    void moveTask(taskId, newStatus);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-3 gap-4 min-h-[400px]">
        {KANBAN_COLS.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            tasks={tasks.filter((t) => t.status === col.id)}
          />
        ))}
      </div>
    </DndContext>
  );
}
