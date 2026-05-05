'use client';

import { useStore } from '@/lib/store';
import { PRIORITY_ORDER } from '@/lib/constants';
import { TaskCard } from './TaskCard';
import { AddTaskForm } from './AddTaskForm';
import { matchesFilters } from '@/lib/filters';
import { matchesSearch } from '@/lib/matchers';

export function ListView() {
  const tasks = useStore((s) => s.tasks);
  const filters = useStore((s) => s.filters);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const projects = useStore((s) => s.projects);
  const tags = useStore((s) => s.tags);
  const sorted = [...tasks]
    .filter(
      (t) =>
        matchesFilters(t, filters) &&
        matchesSearch(t, searchQuery, { projects, tags }),
    )
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div>
      <div className="flex flex-col gap-3">
        {sorted.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        <AddTaskForm />
      </div>
      {sorted.length === 0 && (
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
            No tasks yet. Create one above!
          </div>
        )
      )}
    </div>
  );
}
