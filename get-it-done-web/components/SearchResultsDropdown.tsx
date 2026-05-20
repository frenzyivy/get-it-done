'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '@/lib/store';
import { matchesSearch } from '@/lib/matchers';
import { PriorityBadge } from './PriorityBadge';
import { ProjectBadge } from './ProjectBadge';
import { EditTaskDrawer } from './EditTaskDrawer';
import { fmtShort } from '@/lib/utils';
import type { Priority, TaskType } from '@/types';

// Feature 7 (delta) — Search + drag-from-results.
//
// The dropdown is rendered inside each view's <DndContext> so that a
// draggable row can be dropped onto that view's droppables (Matrix
// quadrants, Today's drop zone, Priority swimlanes). @dnd-kit drags do
// NOT cross context boundaries — that's why we don't render this from
// inside TaskSearchInput.
//
// We position the panel as `position: fixed` using the input's bounding
// rect, which is published to the store by TaskSearchInput. The panel
// also portals to <body> so transformed parents (Today's NextActionModal
// backdrop, etc.) don't trap it.

const MAX_RESULTS = 15;
const PANEL_MIN_WIDTH = 360;

const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function SearchResultsDropdown() {
  const open = useStore((s) => s.searchDropdownOpen);
  const anchor = useStore((s) => s.searchAnchorRect);
  const query = useStore((s) => s.searchQuery);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const tags = useStore((s) => s.tags);
  const setOpen = useStore((s) => s.setSearchDropdownOpen);

  const [editingId, setEditingId] = useState<string | null>(null);

  const results = useMemo<TaskType[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const matched = tasks
      .filter((t) => matchesSearch(t, q, { projects, tags }))
      // Brief: results panel is for finding tasks to act on, not a history
      // view. Done tasks rank last so an open task always shows first.
      .slice()
      .sort((a, b) => {
        const aDone = a.effective_status === 'done' ? 1 : 0;
        const bDone = b.effective_status === 'done' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        const pa = PRIORITY_RANK[a.priority];
        const pb = PRIORITY_RANK[b.priority];
        if (pa !== pb) return pb - pa;
        return a.title.localeCompare(b.title);
      });
    return matched.slice(0, MAX_RESULTS);
  }, [query, tasks, projects, tags]);

  if (!open || !anchor) return null;
  if (typeof document === 'undefined') return null;

  const width = Math.max(anchor.width, PANEL_MIN_WIDTH);
  // Right-align with the input if doing so keeps the panel on screen, else
  // left-align. This handles the search input sitting near the right edge
  // (it's in a flex-wrap row alongside the saved-views dropdown).
  const viewportWidth = window.innerWidth;
  const preferLeft = anchor.left + width <= viewportWidth - 8;
  const left = preferLeft
    ? anchor.left
    : Math.max(8, anchor.left + anchor.width - width);

  const panel = (
    <>
      <div
        role="listbox"
        aria-label="Search results"
        className="fixed z-[55] rounded-[14px] bg-white shadow-[0_24px_48px_-20px_rgba(15,18,38,0.22),0_6px_18px_-12px_rgba(15,18,38,0.12)]"
        style={{
          top: anchor.top + 6,
          left,
          width,
          border: '1px solid rgba(0,0,0,0.08)',
          maxHeight: 420,
          overflow: 'hidden',
        }}
        // Prevent the input's blur from closing the panel before a click /
        // drag landed inside.
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-[rgba(0,0,0,0.06)]">
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#9ca3af]">
            {results.length === 0
              ? 'No results'
              : `${results.length} result${results.length === 1 ? '' : 's'}`}
          </span>
          <span
            className="text-[9px] font-extrabold tracking-[0.12em] uppercase px-2 py-[2px] rounded text-white"
            style={{
              background:
                'linear-gradient(135deg, #1a1a2e 0%, #4b4b6d 100%)',
            }}
            title="Drag a result onto a Matrix quadrant, Today list, or Priority lane"
          >
            Drag to assign
          </span>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 420 - 38 }}>
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-[#9ca3af] italic">
              No tasks match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            results.map((task) => (
              <SearchResultRow
                key={task.id}
                task={task}
                onOpen={() => setEditingId(task.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Invisible scrim that closes the panel on outside click. Click-through
          on the input itself is fine because the panel is closed when the
          input blurs anyway; this is just for clicks elsewhere on the page. */}
      <div
        aria-hidden
        className="fixed inset-0 z-[54]"
        onMouseDown={() => setOpen(false)}
      />
    </>
  );

  return (
    <>
      {createPortal(panel, document.body)}
      {editingId && (
        <EditTaskDrawer
          key={editingId}
          taskId={editingId}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  );
}

function SearchResultRow({
  task,
  onOpen,
}: {
  task: TaskType;
  onOpen: () => void;
}) {
  const projects = useStore((s) => s.projects);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: { source: 'search', taskId: task.id },
    });

  const taskProjects = task.project_ids
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const isDone = task.effective_status === 'done';

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
      role="option"
      aria-selected={false}
      tabIndex={0}
      onClick={(e) => {
        // Skip click-to-open when the user actually dragged.
        if (isDragging) return;
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="px-3 py-[10px] border-b border-[rgba(0,0,0,0.04)] last:border-b-0 hover:bg-[rgba(26,26,46,0.04)] flex items-center gap-3"
    >
      <span className="text-[#9ca3af] text-[12px] leading-none" aria-hidden>
        ⋮⋮
      </span>
      <div className="flex-1 min-w-0">
        <div
          className={`text-[13px] font-semibold truncate ${
            isDone ? 'line-through text-[#9ca3af]' : 'text-[#1a1a2e]'
          }`}
          title={task.title}
        >
          {task.title}
        </div>
        <div className="flex items-center gap-[6px] mt-[3px] flex-wrap">
          <PriorityBadge priority={task.priority} />
          {taskProjects.slice(0, 1).map((p) => (
            <ProjectBadge key={p.id} project={p} />
          ))}
          {task.estimated_seconds && task.estimated_seconds > 0 ? (
            <span className="text-[10px] font-mono text-[#9ca3af]">
              est {fmtShort(task.estimated_seconds)}
            </span>
          ) : null}
          {isDone && (
            <span className="text-[9px] font-bold tracking-wider uppercase text-[#10b981]">
              Done
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
