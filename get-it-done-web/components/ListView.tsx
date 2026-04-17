'use client';

import { useStore } from '@/lib/store';
import { PRIORITY_ORDER } from '@/lib/constants';
import { TaskCard } from './TaskCard';
import { AddTaskForm } from './AddTaskForm';

export function ListView() {
  const tasks = useStore((s) => s.tasks);
  const sorted = [...tasks].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );

  return (
    <div>
      <div className="flex flex-col gap-3">
        {sorted.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        <AddTaskForm />
      </div>
      {sorted.length === 0 && (
        <div className="text-center py-10 text-[#aaa] text-sm">
          No tasks yet. Create one above!
        </div>
      )}
    </div>
  );
}
