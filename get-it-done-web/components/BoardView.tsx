'use client';

import { useStore } from '@/lib/store';
import { KANBAN_COLS } from '@/lib/constants';
import { TaskCard } from './TaskCard';
import { AddTaskForm } from './AddTaskForm';
import { matchesFilters } from '@/lib/filters';
import { matchesSearch } from '@/lib/matchers';

// v2 spec §6 — one column at a time, full width.
// Desktop users still get drag-and-drop via the existing KanbanView (kept as
// an option later if we want a Board-Wide desktop mode). For M1 this is the
// default across both platforms.
export function BoardView() {
  const tasks = useStore((s) => s.tasks);
  const activeColumn = useStore((s) => s.activeColumn);
  const filters = useStore((s) => s.filters);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const projects = useStore((s) => s.projects);
  const tags = useStore((s) => s.tags);

  const colMeta = KANBAN_COLS.find((c) => c.id === activeColumn);
  const colTasks = tasks.filter(
    (t) =>
      t.effective_status === activeColumn &&
      matchesFilters(t, filters) &&
      matchesSearch(t, searchQuery, { projects, tags }),
  );

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      {colTasks.length === 0 ? (
        isSearching ? (
          <div className="text-center py-10 text-[#888] text-sm">
            <div>No tasks match &ldquo;{searchQuery}&rdquo;</div>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2 text-[12px] text-[#1a1a2e] underline cursor-pointer bg-transparent border-0"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="text-center py-10 text-[#aaa] text-sm">
            No tasks in {colMeta?.label ?? 'this column'} · Tap + New Task to add one.
          </div>
        )
      ) : (
        colTasks.map((task) => <TaskCard key={task.id} task={task} />)
      )}
      {/* Per spec: every fresh task starts as 'todo'. The active column tab
          must NOT influence the new task's status — status only changes when
          real work happens (timer started, completed_at set). */}
      <AddTaskForm />
    </div>
  );
}
