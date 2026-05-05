'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { isToday, labelTintBg } from '@/lib/utils';
import type { PlannedBlock, ProjectType, TaskType } from '@/types';
import { EditTaskDrawer } from './EditTaskDrawer';
import { QuickAddPopover } from './QuickAddPopover';

// Feature 10 — Month View. Google Calendar style: 6 rows x 7 columns = 42
// cells, anchored on a Sunday. The current month sits in the middle; leading
// and trailing rows show the prev/next month "buffer" so the user can still
// click into adjacent days.
//
// Spec note: the original spec says table `schedule_block` and column
// `projects.color_token`. The codebase has `planned_blocks` (migration 0012)
// and a flat `projects.color` hex, so we use those. See plan file for context.

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const PILLS_PER_CELL = 3;
const NEUTRAL_COLOR = '#9ca3af'; // gray-400 — used when a block has no project

interface CellData {
  date: Date;
  dateMs: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  blocks: PlannedBlock[];
}

function buildMonthCells(monthAnchor: Date): {
  cells: Date[];
  gridStart: Date;
  gridEndExclusive: Date;
} {
  const firstOfMonth = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  const dayOfWeek = firstOfMonth.getDay(); // 0 = Sun
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(1 - dayOfWeek);
  gridStart.setHours(0, 0, 0, 0);

  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const gridEndExclusive = new Date(gridStart);
  gridEndExclusive.setDate(gridStart.getDate() + 42);

  return { cells, gridStart, gridEndExclusive };
}

function formatHm(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

interface PillRenderData {
  block: PlannedBlock;
  title: string;
  color: string; // hex foreground / accent
  bg: string; // tinted background
}

interface DayCellProps {
  cell: CellData;
  pills: PillRenderData[];
  overflow: number;
  isSelected: boolean;
  onCellClick: (date: Date) => void;
  onPillClick: (taskId: string) => void;
  onQuickAdd: (date: Date, anchorEl: HTMLElement) => void;
}

function DayCell({
  cell,
  pills,
  overflow,
  isSelected,
  onCellClick,
  onPillClick,
  onQuickAdd,
}: DayCellProps) {
  const dayNumber = cell.date.getDate();

  // Visual layers: today wins on the day-number circle, but selected (current
  // day-view date) takes the cell-border. Other-month cells fade their digits.
  // The `+` button is always mounted (no remount/flicker) and toggled via
  // `group-hover` opacity — Feature 13. `pointer-events-none` while hidden so
  // it doesn't intercept clicks meant for the cell.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onCellClick(cell.date)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCellClick(cell.date);
        }
      }}
      className={`group relative flex min-h-[110px] flex-col gap-1 px-2 py-1.5 text-left transition-colors hover:bg-[#f9fafb] ${
        cell.inCurrentMonth ? 'bg-white' : 'bg-[#fafafa]'
      } ${isSelected ? 'ring-2 ring-[#a78bfa] ring-inset' : ''} cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#a78bfa] focus:ring-inset`}
      style={{ borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}
    >
      <div className="flex items-start justify-between">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${
            cell.isToday
              ? 'bg-[#f97316] text-white'
              : cell.inCurrentMonth
              ? 'text-[#1a1a2e]'
              : 'text-[#cbd5e1]'
          }`}
        >
          {dayNumber}
        </div>
        <button
          type="button"
          aria-label="Quick-add task to this day"
          onClick={(e) => {
            e.stopPropagation();
            onQuickAdd(cell.date, e.currentTarget);
          }}
          className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[14px] leading-none text-[#6b7280] opacity-0 transition-opacity duration-100 hover:bg-[#f3f4f6] group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
        >
          +
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {pills.map((p) => (
          <button
            key={p.block.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (p.block.task_id) onPillClick(p.block.task_id);
            }}
            disabled={!p.block.task_id}
            className="truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight disabled:cursor-default"
            style={{ background: p.bg, color: p.color }}
            title={p.title}
          >
            <span className="font-mono text-[10px] tabular-nums opacity-80">
              {formatHm(p.block.start_at)}
            </span>{' '}
            <span className="truncate">{p.title}</span>
          </button>
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCellClick(cell.date);
            }}
            className="truncate px-1.5 text-left text-[11px] text-[#6b7280] hover:text-[#1a1a2e]"
          >
            + {overflow} more
          </button>
        )}
      </div>
    </div>
  );
}

export function ScheduleMonthGrid() {
  const userId = useStore((s) => s.userId);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const setScheduleSubView = useStore((s) => s.setScheduleSubView);
  const setScheduleDayStart = useStore((s) => s.setScheduleDayStart);
  const scheduleDayStartMs = useStore((s) => s.scheduleDayStartMs);

  // Feature 14 — month anchor is derived from the shared `scheduleDayStartMs`,
  // not local state. This keeps Day/Week/Month perfectly in sync: navigating in
  // any view updates the same source of truth via useScheduleNav.
  const monthAnchor = useMemo(() => {
    const d = new Date(scheduleDayStartMs);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [scheduleDayStartMs]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  // Feature 13 — quick-add popover state. We store the cell date plus a snapshot
  // of the trigger button's bounding rect so the popover can position itself
  // (and reposition on scroll/resize) without holding a DOM ref to a button
  // that re-renders.
  const [quickAdd, setQuickAdd] = useState<{
    date: Date;
    rect: { top: number; bottom: number; left: number; right: number };
  } | null>(null);

  const handleQuickAdd = (date: Date, anchorEl: HTMLElement) => {
    const r = anchorEl.getBoundingClientRect();
    setQuickAdd({
      date,
      rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
    });
  };

  const { cells, gridStart, gridEndExclusive } = useMemo(
    () => buildMonthCells(monthAnchor),
    [monthAnchor],
  );

  // Fetch the buffered window when the month changes. RLS on planned_blocks
  // already scopes to the authed user; we just pass ISO bounds.
  useEffect(() => {
    if (!userId) return;
    void fetchPlannedBlocks(gridStart.toISOString(), gridEndExclusive.toISOString());
  }, [userId, fetchPlannedBlocks, gridStart, gridEndExclusive]);

  const tasksById = useMemo(() => {
    const m = new Map<string, TaskType>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const projectsById = useMemo(() => {
    const m = new Map<string, ProjectType>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  // Group blocks by local YYYY-MM-DD so cell render is O(1) per cell.
  const blocksByDay = useMemo(() => {
    const m = new Map<string, PlannedBlock[]>();
    for (const b of plannedBlocks) {
      const d = new Date(b.start_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = m.get(key) ?? [];
      arr.push(b);
      m.set(key, arr);
    }
    // Sort within day by start_at (the fetch already orders, but client-side
    // grouping doesn't preserve order if blocks span multiple fetches).
    for (const arr of m.values()) {
      arr.sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      );
    }
    return m;
  }, [plannedBlocks]);

  const monthIndex = monthAnchor.getMonth();

  const handleCellClick = (date: Date) => {
    setScheduleDayStart(date);
    setScheduleSubView('day');
  };

  const handlePillClick = (taskId: string) => {
    setEditingTaskId(taskId);
  };

  return (
    <div
      className="rounded-[14px] overflow-hidden"
      style={{ background: '#fff', border: '1px solid #e5e7eb' }}
    >
      <div className="grid grid-cols-7 border-b border-[#e5e7eb] bg-[#fafafa]">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-[11px] font-mono uppercase tracking-[1px] text-[#9ca3af]"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7" style={{ borderTop: '1px solid #e5e7eb' }}>
        {cells.map((date) => {
          const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const blocks = blocksByDay.get(key) ?? [];
          const inCurrentMonth = date.getMonth() === monthIndex;
          const cellIsToday = isToday(date.toISOString());
          const isSelected = date.getTime() === scheduleDayStartMs;

          const visible = blocks.slice(0, PILLS_PER_CELL);
          const overflow = blocks.length - visible.length;

          const pills: PillRenderData[] = visible.map((block) => {
            const task = block.task_id ? tasksById.get(block.task_id) : undefined;
            const project = task?.project_ids[0]
              ? projectsById.get(task.project_ids[0])
              : undefined;
            const color = project?.color ?? NEUTRAL_COLOR;
            const title = task?.title ?? block.notes ?? 'Untitled';
            return {
              block,
              title,
              color,
              bg: labelTintBg(color),
            };
          });

          return (
            <DayCell
              key={key}
              cell={{
                date,
                dateMs: date.getTime(),
                inCurrentMonth,
                isToday: cellIsToday,
                blocks,
              }}
              pills={pills}
              overflow={overflow}
              isSelected={isSelected}
              onCellClick={handleCellClick}
              onPillClick={handlePillClick}
              onQuickAdd={handleQuickAdd}
            />
          );
        })}
      </div>

      {editingTaskId && (
        <EditTaskDrawer
          key={editingTaskId}
          taskId={editingTaskId}
          onClose={() => setEditingTaskId(null)}
        />
      )}

      {quickAdd && (
        <QuickAddPopover
          cellDate={quickAdd.date}
          anchorRect={quickAdd.rect}
          onClose={() => setQuickAdd(null)}
        />
      )}
    </div>
  );
}
