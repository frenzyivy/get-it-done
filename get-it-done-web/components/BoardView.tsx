'use client';

import { useStore } from '@/lib/store';
import { KANBAN_COLS } from '@/lib/constants';
import { TaskCard } from './TaskCard';
import { AddTaskForm } from './AddTaskForm';

// v2 spec §6 — one column at a time, full width.
// Desktop users still get drag-and-drop via the existing KanbanView (kept as
// an option later if we want a Board-Wide desktop mode). For M1 this is the
// default across both platforms.
export function BoardView() {
  const tasks = useStore((s) => s.tasks);
  const activeColumn = useStore((s) => s.activeColumn);

  const colMeta = KANBAN_COLS.find((c) => c.id === activeColumn);
  const colTasks = tasks.filter((t) => t.status === activeColumn);

  return (
    <div className="flex flex-col gap-3">
      {colTasks.length === 0 ? (
        <div className="text-center py-10 text-[#aaa] text-sm">
          No tasks in {colMeta?.label ?? 'this column'} · Tap + New Task to add one.
        </div>
      ) : (
        colTasks.map((task) => <TaskCard key={task.id} task={task} />)
      )}
      <AddTaskForm defaultStatus={activeColumn} />
    </div>
  );
}
