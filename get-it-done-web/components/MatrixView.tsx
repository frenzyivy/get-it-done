'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '@/lib/store';
import { matchesFilters } from '@/lib/filters';
import { matchesSearch } from '@/lib/matchers';
import { PriorityBadge } from './PriorityBadge';
import { ProjectBadge } from './ProjectBadge';
import { CategoryPill } from './CategoryPill';
import { SearchResultsDropdown } from './SearchResultsDropdown';
import type { MatrixQuadrant, TaskType } from '@/types';

// Phase 3 — Eisenhower 2x2 strategic-triage view. Used weekly, not daily.
//
// Quadrants:
//                 Urgent          Not Urgent
//   Important   | DO FIRST      | SCHEDULE
//   Not Imp.    | DELEGATE      | DROP
//
// Plus an Unsorted tray below for tasks that haven't been triaged. Done tasks
// are filtered out (the matrix is about open work). Drag-and-drop sets
// matrix_quadrant; the column is independent of status and today_for_date.

interface QuadrantMeta {
  id: MatrixQuadrant;
  label: string;
  axis: string;
  accent: string;
  bar: string; // gradient color band along the top
  pill: string;
}

const QUADRANTS: QuadrantMeta[] = [
  {
    id: 'do_first',
    label: 'DO FIRST',
    axis: 'Important · Urgent',
    accent: '#dc2626',
    bar: 'linear-gradient(90deg, #ef4444, #f87171)',
    pill: '#dc2626',
  },
  {
    id: 'delegate',
    label: 'DELEGATE',
    axis: 'Not Important · Urgent',
    accent: '#b45309',
    bar: 'linear-gradient(90deg, #f59e0b, #fcd34d)',
    pill: '#f59e0b',
  },
  {
    id: 'schedule',
    label: 'SCHEDULE',
    axis: 'Important · Not Urgent',
    accent: '#1a1a2e',
    bar: 'linear-gradient(90deg, #1a1a2e, #4b4b6d)',
    pill: '#1a1a2e',
  },
  {
    id: 'drop',
    label: 'DROP',
    axis: 'Not Important · Not Urgent',
    accent: '#6b7280',
    bar: 'linear-gradient(90deg, #94a3b8, #cbd5e1)',
    pill: '#94a3b8',
  },
];

export function MatrixView() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const tags = useStore((s) => s.tags);
  const filters = useStore((s) => s.filters);
  const searchQuery = useStore((s) => s.searchQuery);
  const setMatrixQuadrant = useStore((s) => s.setMatrixQuadrant);

  // Matrix-local search and project filter for the Unsorted tray. The global
  // FilterBar's project filter still applies (via matchesFilters) so the
  // tray's project dropdown is a *narrower* per-view scope on top of it.
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixProjectId, setMatrixProjectId] = useState<string>('');

  // Open tasks only — matrix is for strategic triage of work that's still
  // ahead of you. Done tasks fall out entirely.
  const openTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.effective_status !== 'done' &&
          matchesFilters(t, filters) &&
          matchesSearch(t, searchQuery, { projects, tags }),
      ),
    [tasks, filters, searchQuery, projects, tags],
  );

  const byQuadrant = useMemo(() => {
    const groups: Record<MatrixQuadrant, TaskType[]> = {
      do_first: [],
      schedule: [],
      delegate: [],
      drop: [],
      unsorted: [],
    };
    for (const t of openTasks) {
      const q = (t.matrix_quadrant ?? 'unsorted') as MatrixQuadrant;
      (groups[q] ?? groups.unsorted).push(t);
    }
    return groups;
  }, [openTasks]);

  // Unsorted tray gets its own search + project filter applied on top.
  const trayTasks = useMemo(() => {
    const q = matrixSearch.trim().toLowerCase();
    return byQuadrant.unsorted.filter((t) => {
      if (matrixProjectId && !t.project_ids.includes(matrixProjectId))
        return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [byQuadrant.unsorted, matrixSearch, matrixProjectId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const taskId = String(e.active.id);
    const next = String(e.over.id) as MatrixQuadrant;
    void setMatrixQuadrant(taskId, next);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {/* Feature 7 — search results dropdown lives inside this DndContext so
          a draggable result row can be dropped onto any quadrant or the
          Unsorted tray. */}
      <SearchResultsDropdown />
      <div className="flex items-end justify-between mb-4 mt-1 gap-3 flex-wrap">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-[-0.5px] text-[#1a1a2e] m-0">
            Priority Matrix
          </h1>
          <p className="text-[12px] text-[#6b7280] mt-1 max-w-[560px] m-0">
            Drag tasks across quadrants. The top-left is what you open this app
            to find every morning. Quadrants are independent of Today — a task
            can be in <b>DO FIRST</b> and on Today and in progress all at once.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[#6b7280]">
          <span className="font-mono uppercase tracking-[0.5px]">
            {openTasks.length} open · {byQuadrant.unsorted.length} unsorted
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {QUADRANTS.map((q) => (
          <Quadrant key={q.id} meta={q} tasks={byQuadrant[q.id]} />
        ))}
      </div>

      <UnsortedTray
        tasks={trayTasks}
        totalCount={byQuadrant.unsorted.length}
        search={matrixSearch}
        setSearch={setMatrixSearch}
        projectId={matrixProjectId}
        setProjectId={setMatrixProjectId}
      />

      <div
        className="rounded-[12px] p-3 mt-3 text-[12px] text-[#666] flex items-start gap-2"
        style={{
          background: 'rgba(26,26,46,0.04)',
          border: '1px solid rgba(26,26,46,0.08)',
        }}
      >
        <span aria-hidden className="text-base leading-none">💡</span>
        <span>
          <b className="text-[#1a1a2e]">Matrix is strategic.</b> Use it weekly
          to decide <i>what</i> matters. Use Today to decide the <i>order</i>{' '}
          you do them in.
        </span>
      </div>
    </DndContext>
  );
}

// One drop-zone quadrant. The colored band along the top + the title row
// follows the demo HTML; sizing is generous so the quadrants stay readable
// even on a 1280-wide laptop.
function Quadrant({ meta, tasks }: { meta: QuadrantMeta; tasks: TaskType[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: meta.id });
  return (
    <div
      ref={setNodeRef}
      className="bg-white rounded-[16px] relative overflow-hidden transition-colors"
      style={{
        border: isOver
          ? `1.5px dashed ${meta.accent}`
          : '1px solid rgba(0,0,0,0.06)',
        background: isOver ? '#fff8f8' : '#fff',
        minHeight: 220,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      <div className="h-[3px]" style={{ background: meta.bar }} />
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="w-[8px] h-[8px] rounded-full inline-block"
                style={{ background: meta.pill }}
                aria-hidden
              />
              <h3 className="text-[13px] font-extrabold tracking-[1px] uppercase text-[#1a1a2e] m-0">
                {meta.label}
              </h3>
            </div>
            <div className="text-[11px] text-[#9ca3af] mt-[2px]">
              {meta.axis}
            </div>
          </div>
          <span className="text-[11px] font-mono text-[#9ca3af]">
            {tasks.length}
          </span>
        </div>
        <div className="flex flex-col gap-2 mt-1 min-h-[40px]">
          {tasks.length === 0 ? (
            <p className="text-center text-[11px] text-[#bfc3cc] py-3 italic">
              Drag tasks here
            </p>
          ) : (
            tasks.map((t) => <MatrixCard key={t.id} task={t} compact />)
          )}
        </div>
      </div>
    </div>
  );
}

function UnsortedTray({
  tasks,
  totalCount,
  search,
  setSearch,
  projectId,
  setProjectId,
}: {
  tasks: TaskType[];
  totalCount: number;
  search: string;
  setSearch: (v: string) => void;
  projectId: string;
  setProjectId: (v: string) => void;
}) {
  const projects = useStore((s) => s.projects);
  const { isOver, setNodeRef } = useDroppable({ id: 'unsorted' });

  return (
    <div
      ref={setNodeRef}
      className="bg-white rounded-[16px] p-4 transition-colors"
      style={{
        border: isOver
          ? '1.5px dashed #1a1a2e'
          : '1px solid rgba(0,0,0,0.06)',
        background: isOver ? 'rgba(26,26,46,0.03)' : '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-[13px] font-extrabold tracking-[1px] uppercase text-[#1a1a2e] m-0 flex items-center gap-2">
            <span aria-hidden>📥</span> Unsorted
            <span className="text-[11px] font-mono text-[#9ca3af] font-normal">
              {totalCount}
            </span>
          </h3>
          <p className="text-[11px] text-[#9ca3af] m-0 mt-[2px]">
            Search across all projects and drag tasks into a quadrant.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="pl-7 pr-3 py-[6px] text-[12px] rounded-lg border-[1.5px] border-[#e5e7eb] bg-white w-[200px] outline-none focus:border-[#1a1a2e]"
            />
            <span
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9ca3af] text-[12px]"
              aria-hidden
            >
              🔍
            </span>
          </div>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="text-[12px] rounded-lg border-[1.5px] border-[#e5e7eb] bg-white px-3 py-[6px] outline-none focus:border-[#1a1a2e]"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-center text-[12px] text-[#9ca3af] py-6 italic">
          {totalCount === 0
            ? 'Nothing unsorted — every task is in a quadrant. Nice.'
            : search || projectId
              ? 'No tasks match your filter.'
              : 'Drag tasks here to send them back to unsorted.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {tasks.map((t) => (
            <MatrixCard key={t.id} task={t} compact />
          ))}
        </div>
      )}
    </div>
  );
}

// Compact draggable task card used inside quadrants and the tray. Smaller than
// the regular TaskCard so the 2x2 grid stays scannable — at-a-glance triage
// over rich detail. Click to open the edit drawer for fuller fields.
function MatrixCard({ task, compact }: { task: TaskType; compact?: boolean }) {
  const tags = useStore((s) => s.tags);
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: { taskId: task.id },
    });

  const taskProjects = task.project_ids
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const taskCategories = task.category_ids
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  // Silence the unused warning — tags isn't rendered here on purpose
  // (the compact card prefers categories + projects), but kept the lookup so
  // a future variant can render tag chips without re-wiring the store.
  void tags;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
        touchAction: 'none',
      }}
      className="bg-[#fafafa] hover:bg-white rounded-[10px] px-3 py-2 transition-colors"
      title={task.title}
    >
      <div className="text-[12px] font-semibold text-[#1a1a2e] truncate mb-[4px]">
        {task.title}
      </div>
      <div className="flex items-center gap-[5px] flex-wrap">
        <PriorityBadge priority={task.priority} />
        {!compact &&
          taskCategories.map((c) => <CategoryPill key={c.id} category={c} />)}
        {taskProjects.slice(0, 1).map((p) => (
          <ProjectBadge key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}
