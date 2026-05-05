'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { matchesFilters } from '@/lib/filters';
import { matchesSearch } from '@/lib/matchers';
import { PriorityColumn } from './PriorityColumn';

// Spec Change #5 — three priority swimlanes. The schema has 4 priorities
// (urgent/high/medium/low); spec defines 3 lanes (Urgent/Med/Low) so 'high'
// folds into the Med lane. The Urgent lane is the black "current focus" card
// per spec §6 visual rule. FilterBar inheritance carries over because the
// bar lives one level up in Dashboard and we apply matchesFilters here.
export function PriorityView() {
  const tasks = useStore((s) => s.tasks);
  const filters = useStore((s) => s.filters);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const projects = useStore((s) => s.projects);
  const tags = useStore((s) => s.tags);

  const { urgent, med, low, total } = useMemo(() => {
    const filtered = tasks.filter(
      (t) =>
        matchesFilters(t, filters) &&
        matchesSearch(t, searchQuery, { projects, tags }),
    );
    return {
      urgent: filtered.filter((t) => t.priority === 'urgent'),
      med: filtered.filter(
        (t) => t.priority === 'high' || t.priority === 'medium',
      ),
      low: filtered.filter((t) => t.priority === 'low'),
      total: filtered.length,
    };
  }, [tasks, filters, searchQuery, projects, tags]);

  if (total === 0 && searchQuery.trim()) {
    return (
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
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <PriorityColumn
        label="Urgent"
        addPriority="urgent"
        tasks={urgent}
        variant="black"
      />
      <PriorityColumn
        label="Med"
        addPriority="medium"
        tasks={med}
        variant="frost"
      />
      <PriorityColumn
        label="Low"
        addPriority="low"
        tasks={low}
        variant="frost"
      />
    </div>
  );
}
