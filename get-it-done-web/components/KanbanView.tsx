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
  const activeSessions = useStore((s) => s.activeSessions);
  const showToast = useStore((s) => s.showToast);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const taskId = String(e.active.id);
    const newStatus = String(e.over.id) as Status;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.effective_status === newStatus) return;

    // Spec Change #1 — In Progress is derived, not chosen. A drag to
    // In Progress without any logged time bounces back with a toast.
    // "Logged time" = closed task time, OR any subtask with closed time,
    // OR a currently-running tracked_session on the task or a subtask.
    if (newStatus === 'in_progress') {
      const taskHasTime =
        task.total_time_seconds > 0 || task.tracked_total_seconds > 0;
      const subtaskHasTime = task.subtasks.some(
        (s) => s.total_time_seconds > 0 || s.tracked_total_seconds > 0,
      );
      const liveSession = activeSessions.some((s) => s.task_id === taskId);
      if (!taskHasTime && !subtaskHasTime && !liveSession) {
        showToast(
          'Status updates from logged time. Start a timer to move this to In Progress.',
        );
        return;
      }
    }

    void moveTask(taskId, newStatus);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-3 gap-4 min-h-[400px]">
        {KANBAN_COLS.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            tasks={tasks.filter((t) => t.effective_status === col.id)}
          />
        ))}
      </div>
    </DndContext>
  );
}
