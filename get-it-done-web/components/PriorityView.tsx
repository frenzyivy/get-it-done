'use client';

import { useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useStore } from '@/lib/store';
import { matchesFilters } from '@/lib/filters';
import { matchesSearch } from '@/lib/matchers';
import { PriorityColumn } from './PriorityColumn';
import { SearchResultsDropdown } from './SearchResultsDropdown';
import type { Priority } from '@/types';

const PRIORITY_DROP_PREFIX = 'priority-';

// Four priority lanes in a 2x2 grid (urgent / high / medium / low). The
// Urgent lane is the black "current focus" card per spec §6 visual rule.
// FilterBar inheritance carries over because the bar lives one level up in
// Dashboard and we apply matchesFilters here — saved views applied on the
// priority page stay on priority (loadView no longer switches view away
// when filters can be applied in-place).
export function PriorityView() {
  const tasks = useStore((s) => s.tasks);
  const filters = useStore((s) => s.filters);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const projects = useStore((s) => s.projects);
  const tags = useStore((s) => s.tags);
  const showCompleted = useStore((s) => s.showCompleted);
  const updateTask = useStore((s) => s.updateTask);

  const { urgent, high, medium, low, total } = useMemo(() => {
    const filtered = tasks.filter(
      (t) =>
        matchesFilters(t, filters) &&
        matchesSearch(t, searchQuery, { projects, tags }) &&
        // Phase 1.1 — hide completed by default.
        (showCompleted || t.effective_status !== 'done'),
    );
    return {
      urgent: filtered.filter((t) => t.priority === 'urgent'),
      high: filtered.filter((t) => t.priority === 'high'),
      medium: filtered.filter((t) => t.priority === 'medium'),
      low: filtered.filter((t) => t.priority === 'low'),
      total: filtered.length,
    };
  }, [tasks, filters, searchQuery, projects, tags, showCompleted]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Feature 7 — search-result drop. The dropdown lives inside the DndContext
  // so a draggable result row can be dropped onto any swimlane to change
  // that task's priority. We only handle search-source drops here; existing
  // in-view PriorityTaskCards are not yet draggable (intentional — the card
  // has its own complex interactivity and a drag handle refactor is out of
  // scope for this delta).
  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const overId = String(e.over.id);
    if (!overId.startsWith(PRIORITY_DROP_PREFIX)) return;
    const nextPriority = overId.slice(PRIORITY_DROP_PREFIX.length) as Priority;
    const taskId = String(e.active.id);
    void updateTask(taskId, { priority: nextPriority });
  };

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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SearchResultsDropdown />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PriorityColumn
          label="Urgent"
          addPriority="urgent"
          tasks={urgent}
          variant="black"
          dropId={`${PRIORITY_DROP_PREFIX}urgent`}
        />
        <PriorityColumn
          label="High"
          addPriority="high"
          tasks={high}
          variant="frost"
          accent="#dc2626"
          dropId={`${PRIORITY_DROP_PREFIX}high`}
        />
        <PriorityColumn
          label="Medium"
          addPriority="medium"
          tasks={medium}
          variant="frost"
          accent="#d97706"
          dropId={`${PRIORITY_DROP_PREFIX}medium`}
        />
        <PriorityColumn
          label="Low"
          addPriority="low"
          tasks={low}
          variant="frost"
          accent="#6b7280"
          dropId={`${PRIORITY_DROP_PREFIX}low`}
        />
      </div>
    </DndContext>
  );
}
