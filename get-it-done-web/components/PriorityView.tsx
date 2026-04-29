'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { matchesFilters } from '@/lib/filters';
import { PriorityColumn } from './PriorityColumn';

// Spec Change #5 — three priority swimlanes. The schema has 4 priorities
// (urgent/high/medium/low); spec defines 3 lanes (Urgent/Med/Low) so 'high'
// folds into the Med lane. The Urgent lane is the black "current focus" card
// per spec §6 visual rule. FilterBar inheritance carries over because the
// bar lives one level up in Dashboard and we apply matchesFilters here.
export function PriorityView() {
  const tasks = useStore((s) => s.tasks);
  const filters = useStore((s) => s.filters);

  const { urgent, med, low } = useMemo(() => {
    const filtered = tasks.filter((t) => matchesFilters(t, filters));
    return {
      urgent: filtered.filter((t) => t.priority === 'urgent'),
      med: filtered.filter(
        (t) => t.priority === 'high' || t.priority === 'medium',
      ),
      low: filtered.filter((t) => t.priority === 'low'),
    };
  }, [tasks, filters]);

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
