'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { matchesFilters } from '@/lib/filters';
import { ProjectCard } from './ProjectCard';
import { ListView } from './ListView';
import type { TaskType } from '@/types';

type GroupBy = 'project' | 'category' | 'flat';
type SortBy = 'progress' | 'recent' | 'total_time' | 'alpha';

const GROUP_LABEL: Record<GroupBy, string> = {
  project: 'Project',
  category: 'Category',
  flat: 'Flat list',
};

const SORT_LABEL: Record<SortBy, string> = {
  progress: 'progress',
  recent: 'recently worked',
  total_time: 'total time',
  alpha: 'alphabetical',
};

interface Bucket {
  key: string;
  label: string;
  color: string;
  // Project ID for the per-card "+ Add task to X" prefill. null for category
  // cards and the Unassigned bucket — those shouldn't auto-attach a project.
  addProjectId: string | null;
  isActive: boolean;
  tasks: TaskType[];
}

// Spec §6 — List by project view. Renders project-grouped square cards
// (default) or category-grouped, or falls back to the flat ListView. Filter
// bar carries over via `matchesFilters`. Group-by + sort-by are local UI
// state and intentionally NOT persisted via saved views — see Phase 3 step 9
// retro for the rationale.
export function ListByProjectView() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
  const filters = useStore((s) => s.filters);
  const activeSessions = useStore((s) => s.activeSessions);

  const [groupBy, setGroupBy] = useState<GroupBy>('project');
  const [sortBy, setSortBy] = useState<SortBy>('progress');

  const filteredTasks = useMemo(
    () => tasks.filter((t) => matchesFilters(t, filters)),
    [tasks, filters],
  );

  // Project IDs that are currently being timed (for the black-card visual rule).
  const activeProjectIds = useMemo(() => {
    const set = new Set<string>();
    for (const sess of activeSessions) {
      const t = tasks.find((x) => x.id === sess.task_id);
      if (!t) continue;
      for (const pid of t.project_ids) set.add(pid);
    }
    return set;
  }, [activeSessions, tasks]);

  const buckets = useMemo<Bucket[]>(() => {
    if (groupBy === 'flat') return [];

    const result: Bucket[] = [];
    const unassigned: TaskType[] = [];

    if (groupBy === 'project') {
      for (const p of projects) {
        const pTasks = filteredTasks.filter((t) => t.project_ids.includes(p.id));
        if (pTasks.length === 0) continue;
        result.push({
          key: `proj:${p.id}`,
          label: p.name,
          color: p.color,
          addProjectId: p.id,
          isActive: activeProjectIds.has(p.id),
          tasks: pTasks,
        });
      }
      for (const t of filteredTasks) {
        if (t.project_ids.length === 0) unassigned.push(t);
      }
    } else {
      // groupBy === 'category'
      for (const c of categories) {
        const cTasks = filteredTasks.filter((t) => t.category_ids.includes(c.id));
        if (cTasks.length === 0) continue;
        result.push({
          key: `cat:${c.id}`,
          label: c.name,
          color: c.color,
          addProjectId: null,
          isActive: false,
          tasks: cTasks,
        });
      }
      for (const t of filteredTasks) {
        if (t.category_ids.length === 0) unassigned.push(t);
      }
    }

    // Sort the populated buckets per the active sort mode. Unassigned always
    // sorts last regardless of mode.
    result.sort((a, b) => compareBuckets(a, b, sortBy));

    if (unassigned.length > 0) {
      result.push({
        key: 'unassigned',
        label: 'Unassigned',
        color: '',
        addProjectId: null,
        isActive: false,
        tasks: unassigned,
      });
    }
    return result;
  }, [
    groupBy,
    filteredTasks,
    projects,
    categories,
    activeProjectIds,
    sortBy,
  ]);

  if (groupBy === 'flat') {
    return (
      <div>
        <Toolbar
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          sortBy={sortBy}
          setSortBy={setSortBy}
          showSort={false}
        />
        <ListView />
      </div>
    );
  }

  return (
    <div>
      <Toolbar
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        sortBy={sortBy}
        setSortBy={setSortBy}
        showSort
      />
      {buckets.length === 0 ? (
        <div className="text-center py-10 text-[#aaa] text-sm">
          No tasks match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buckets.map((b) => (
            <ProjectCard
              key={b.key}
              label={b.label}
              color={b.color}
              tasks={b.tasks}
              isActive={b.isActive}
              addProjectId={b.addProjectId}
              statusLabel={
                groupBy === 'category'
                  ? 'Category'
                  : b.key === 'unassigned'
                    ? 'Unassigned'
                    : 'Active'
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Toolbar({
  groupBy,
  setGroupBy,
  sortBy,
  setSortBy,
  showSort,
}: {
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  showSort: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-3 flex-wrap">
      <label className="flex items-center gap-2 text-xs text-[#666]">
        <span className="font-mono uppercase tracking-wider text-[10px] text-[#9ca3af]">
          Group by
        </span>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="text-xs px-2 py-1 rounded-lg border-[1.5px] border-[#e5e7eb] bg-white"
        >
          {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
            <option key={g} value={g}>
              {GROUP_LABEL[g]}
            </option>
          ))}
        </select>
      </label>
      {showSort && (
        <label className="flex items-center gap-2 text-xs text-[#666]">
          <span className="font-mono uppercase tracking-wider text-[10px] text-[#9ca3af]">
            Sort by
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="text-xs px-2 py-1 rounded-lg border-[1.5px] border-[#e5e7eb] bg-white"
          >
            {(Object.keys(SORT_LABEL) as SortBy[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function compareBuckets(a: Bucket, b: Bucket, sortBy: SortBy): number {
  switch (sortBy) {
    case 'progress': {
      // Higher progress first.
      return progressOf(b.tasks) - progressOf(a.tasks);
    }
    case 'total_time': {
      const aT = a.tasks.reduce((s, t) => s + t.total_time_seconds, 0);
      const bT = b.tasks.reduce((s, t) => s + t.total_time_seconds, 0);
      return bT - aT;
    }
    case 'recent': {
      // Most recently worked first. 0 (no sessions) sorts last.
      return maxStartedAt(b.tasks) - maxStartedAt(a.tasks);
    }
    case 'alpha':
      return a.label.localeCompare(b.label);
  }
}

function progressOf(tasks: TaskType[]): number {
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((sum, t) => {
    if (t.effective_status === 'done') return sum + 100;
    if (t.subtasks.length === 0) return sum;
    const done = t.subtasks.filter((s) => s.is_done).length;
    return sum + Math.round((done / t.subtasks.length) * 100);
  }, 0);
  return Math.round(total / tasks.length);
}

function maxStartedAt(tasks: TaskType[]): number {
  let max = 0;
  for (const t of tasks) {
    for (const s of t.sessions) {
      const ts = Date.parse(s.started_at);
      if (Number.isFinite(ts) && ts > max) max = ts;
    }
  }
  return max;
}
