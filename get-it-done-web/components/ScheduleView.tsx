'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useStore } from '@/lib/store';
import { useLiveTimers } from '@/lib/useLiveTimer';
import { fmtShort } from '@/lib/utils';
import type { PlannedBlock, ScheduleSnapMode, SubtaskType, TagType, TaskType } from '@/types';
import { CreateScheduleModal } from './CreateScheduleModal';
import { ScheduleMonthGrid } from './ScheduleMonthGrid';
import { ScheduleWeekView } from './ScheduleWeekView';
import { ScheduleDateNav } from './ScheduleDateNav';

const HOUR_HEIGHT = 56; // px per hour row
const START_HOUR = 6;
const END_HOUR = 23; // exclusive — shows up to 22:00 slot
const SNAP_MINUTES = 15;
const MIN_BLOCK_SECONDS = 15 * 60;
const MAX_BLOCK_SECONDS = 8 * 3600;
const DEFAULT_BLOCK_SECONDS = 30 * 60;
const DURATION_PRESETS_MIN = [15, 30, 45, 60, 90, 120, 180] as const;

// Feature 01 — snap helpers. Snap rounds the absolute timestamp / second value
// (not a relative offset) so 15min/1hr land on real wall-clock boundaries.
const SNAP_STEP_MS: Record<ScheduleSnapMode, number> = {
  hour: 60 * 60 * 1000,
  '15min': 15 * 60 * 1000,
  free: 60 * 1000,
};
const SNAP_STEP_SEC: Record<ScheduleSnapMode, number> = {
  hour: 3600,
  '15min': 900,
  free: 60,
};
function snapMs(ms: number, mode: ScheduleSnapMode): number {
  const step = SNAP_STEP_MS[mode];
  return Math.round(ms / step) * step;
}
function snapSec(sec: number, mode: ScheduleSnapMode): number {
  const step = SNAP_STEP_SEC[mode];
  return Math.round(sec / step) * step;
}

// v2 spec § Schedule view (Phase 6 step 17). Day-block layout split into
// Planned (left lane) and Tracked (right lane) so the user can see plan vs
// reality at a glance. Drag tasks from the side palette onto a Planned hour
// to schedule. Drag an existing Planned block onto a different hour to
// reschedule. NOW line spans both lanes.

interface DaySessionRow {
  id: string;
  task_id: string | null;
  subtask_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  mode: string | null;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Feature 15 — header stat formatter. fmtShort returns "0s" for zero; the
// spec wants a bare "0" so the empty-day header reads cleanly.
function fmtStat(secs: number): string {
  return secs <= 0 ? '0' : fmtShort(secs);
}

export function ScheduleView() {
  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const addPlannedBlock = useStore((s) => s.addPlannedBlock);
  const updatePlannedBlock = useStore((s) => s.updatePlannedBlock);
  const deletePlannedBlock = useStore((s) => s.deletePlannedBlock);
  const daySessions = useStore((s) => s.daySessions);
  const fetchDaySessions = useStore((s) => s.fetchDaySessions);
  const dayStats = useStore((s) => s.dayStats);
  const fetchDayStats = useStore((s) => s.fetchDayStats);
  const liveElapsedById = useLiveTimers();
  const tags = useStore((s) => s.tags);
  const userId = useStore((s) => s.userId);
  const activeSessions = useStore((s) => s.activeSessions);
  const snapMode = useStore((s) => s.prefs?.schedule_snap_mode ?? 'hour');
  const updatePrefs = useStore((s) => s.updatePrefs);
  // Feature 09 (minimal) — sub-tab + cross-sub-view selected date.
  const scheduleSubView = useStore((s) => s.scheduleSubView);
  const setScheduleSubView = useStore((s) => s.setScheduleSubView);
  const scheduleDayStartMs = useStore((s) => s.scheduleDayStartMs);
  const setScheduleDayStart = useStore((s) => s.setScheduleDayStart);
  // Feature 11 — Week view drills into Day at a specific hour by setting this
  // intent; Day consumes and clears it on mount.
  const pendingScrollHour = useStore((s) => s.pendingScrollHour);
  const setPendingScrollHour = useStore((s) => s.setPendingScrollHour);

  const [now, setNow] = useState(() => new Date());
  // Body container for the Day-mode hour grid. Used to scroll-to-hour when the
  // Week view drills in at a specific hour.
  const dayBodyRef = useRef<HTMLDivElement | null>(null);

  // Feature 08 — selected date drives the grid. Mirrors the store's
  // `scheduleDayStartMs` so the Month grid can drill into a specific day,
  // while local writes (CreateScheduleModal, day nav) push back to the store.
  const dayStart = useMemo(() => new Date(scheduleDayStartMs), [scheduleDayStartMs]);
  const setDayStart = useCallback(
    (d: Date) => {
      setScheduleDayStart(d);
    },
    [setScheduleDayStart],
  );
  const dayEnd = useMemo(() => {
    const d = new Date(dayStart);
    d.setDate(d.getDate() + 1);
    return d;
  }, [dayStart]);

  const [createOpen, setCreateOpen] = useState(false);
  const dayKey = useMemo(() => ymdLocal(dayStart), [dayStart]);

  useEffect(() => {
    if (!userId) return;
    void fetchPlannedBlocks(dayStart.toISOString(), dayEnd.toISOString());
    void fetchDaySessions(dayKey);
    void fetchDayStats(dayKey);
  }, [userId, fetchPlannedBlocks, fetchDaySessions, fetchDayStats, dayStart, dayEnd, dayKey]);

  // Refetch tracked sessions every minute while a session is active so the
  // current bar grows in near-real-time. When nothing is live, no refetch.
  useEffect(() => {
    if (activeSessions.length === 0) return;
    const id = setInterval(() => {
      void fetchDaySessions(dayKey, true);
      void fetchDayStats(dayKey, true);
    }, 60_000);
    return () => clearInterval(id);
  }, [activeSessions.length, fetchDaySessions, fetchDayStats, dayKey]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Feature 11 — consume `pendingScrollHour` set by the Week view's body-cell
  // click. Only fires when Day is the active sub-view and the body is mounted.
  useEffect(() => {
    if (scheduleSubView !== 'day') return;
    if (pendingScrollHour == null) return;
    const body = dayBodyRef.current;
    if (!body) return;
    const clamped = Math.max(START_HOUR, Math.min(END_HOUR - 1, pendingScrollHour));
    const offsetTop = (clamped - START_HOUR) * HOUR_HEIGHT;
    const targetY = body.getBoundingClientRect().top + window.scrollY + offsetTop;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
    setPendingScrollHour(null);
  }, [scheduleSubView, pendingScrollHour, setPendingScrollHour]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Sidebar status filter — local, in-memory, defaults to "open" each load.
  // Replaces the global search input that used to live here; the global
  // `searchQuery` store slice still drives Board/List/Priority.
  const [sidebarStatus, setSidebarStatus] = useState<'open' | 'done' | 'all'>('open');
  const sidebarTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (sidebarStatus === 'open') return t.effective_status !== 'done';
        if (sidebarStatus === 'done') return t.effective_status === 'done';
        return true;
      }),
    [tasks, sidebarStatus],
  );

  const blocksByHour = useMemo(() => {
    const m = new Map<number, PlannedBlock[]>();
    for (const b of plannedBlocks) {
      const h = new Date(b.start_at).getHours();
      const arr = m.get(h) ?? [];
      arr.push(b);
      m.set(h, arr);
    }
    return m;
  }, [plannedBlocks]);

  // Group tracked sessions by start hour (in local tz). For sessions that
  // cross hour boundaries we still anchor on start_at — the bar's height
  // visually extends into later rows via absolute positioning.
  const sessionsByHour = useMemo(() => {
    const m = new Map<number, DaySessionRow[]>();
    if (!daySessions) return m;
    for (const s of daySessions.sessions) {
      const h = new Date(s.started_at).getHours();
      const arr = m.get(h) ?? [];
      arr.push(s);
      m.set(h, arr);
    }
    return m;
  }, [daySessions]);

  const nowWithinGrid =
    now >= dayStart &&
    now < dayEnd &&
    now.getHours() >= START_HOUR &&
    now.getHours() < END_HOUR;
  const nowOffsetPx =
    (now.getHours() - START_HOUR) * HOUR_HEIGHT +
    (now.getMinutes() / 60) * HOUR_HEIGHT;

  // Feature 01 — minute-precise body drag for existing blocks. dnd-kit only
  // tells us which hour the drop landed in (drop-on-target), so reschedule
  // moves are handled by raw pointer events instead. The palette → grid
  // creation flow below stays on dnd-kit (it doesn't need minute precision).
  const [dragPreview, setDragPreview] = useState<{
    blockId: string;
    startMs: number;
    durationSec: number;
  } | null>(null);

  const dayStartMs = dayStart.getTime();

  const handleMoveStart = useCallback(
    (block: PlannedBlock, e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const originalStartMs = new Date(block.start_at).getTime();
      const durationSec = block.duration_seconds;
      // Day-grid bounds: clamp so start_at ≥ START_HOUR:00 and end_at ≤ END_HOUR:00.
      const dayMinD = new Date(dayStartMs);
      dayMinD.setHours(START_HOUR, 0, 0, 0);
      const dayMaxD = new Date(dayStartMs);
      dayMaxD.setHours(END_HOUR, 0, 0, 0);
      const minMs = dayMinD.getTime();
      const maxMs = dayMaxD.getTime() - durationSec * 1000;

      setDragPreview({ blockId: block.id, startMs: originalStartMs, durationSec });

      let lastSnappedMs = originalStartMs;
      const onMove = (ev: PointerEvent) => {
        const deltaPx = ev.clientY - startY;
        const deltaMs = (deltaPx / HOUR_HEIGHT) * 60 * 60 * 1000;
        const rawMs = originalStartMs + deltaMs;
        const snapped = snapMs(rawMs, snapMode);
        const clamped = Math.max(minMs, Math.min(maxMs, snapped));
        lastSnappedMs = clamped;
        setDragPreview({ blockId: block.id, startMs: clamped, durationSec });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        setDragPreview(null);
        if (lastSnappedMs !== originalStartMs) {
          void updatePlannedBlock(block.id, {
            start_at: new Date(lastSnappedMs).toISOString(),
          });
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [dayStartMs, snapMode, updatePlannedBlock],
  );

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const activeId = String(e.active.id);
    const targetHour = Number(String(e.over.id).replace('hour-', ''));
    if (!Number.isFinite(targetHour)) return;

    // Drag IDs:
    //   `task__<taskId>`             — task palette → schedule (creates block)
    //   `subtask__<taskId>__<subId>` — subtask palette → schedule (creates block)
    // Existing-block reschedule is handled via handleMoveStart (raw pointer events).
    let taskId: string;
    let subtaskId: string | null = null;
    if (activeId.startsWith('subtask__')) {
      const rest = activeId.slice('subtask__'.length);
      const sep = rest.indexOf('__');
      if (sep === -1) return;
      taskId = rest.slice(0, sep);
      subtaskId = rest.slice(sep + 2);
    } else if (activeId.startsWith('task__')) {
      taskId = activeId.slice('task__'.length);
    } else {
      return;
    }
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (subtaskId && !task.subtasks.some((s) => s.id === subtaskId)) return;

    const startAt = new Date(dayStart);
    startAt.setHours(targetHour, 0, 0, 0);
    void addPlannedBlock({
      task_id: task.id,
      subtask_id: subtaskId,
      start_at: startAt.toISOString(),
      duration_seconds: DEFAULT_BLOCK_SECONDS,
      block_type: 'work',
      notes: null,
    });
  };

  const plannedSeconds = plannedBlocks.reduce((s, b) => s + b.duration_seconds, 0);
  // Feature 15 — server-aggregated closed-session total (already net of
  // break_seconds per Feature 05) plus the live elapsed for any running
  // session whose started_at falls on the selected day. The live elapsed
  // already excludes break time via useLiveTimers().
  const trackedSeconds = useMemo(() => {
    const serverClosed = dayStats?.date === dayKey ? dayStats.tracked_seconds : 0;
    let live = 0;
    for (const s of activeSessions) {
      if (ymdLocal(new Date(s.started_at)) === dayKey) {
        live += liveElapsedById[s.id] ?? 0;
      }
    }
    return serverClosed + live;
  }, [dayStats, dayKey, activeSessions, liveElapsedById]);

  const subTabs: { key: 'day' | 'week' | 'month'; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];

  const tabStrip = (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="inline-flex items-center rounded-full border border-[#e5e7eb] bg-white p-0.5">
        {subTabs.map((t) => {
          const active = scheduleSubView === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setScheduleSubView(t.key)}
              className={`rounded-full px-4 py-1 text-[12px] font-semibold transition-colors ${
                active ? 'bg-[#1a1a2e] text-white' : 'text-[#6b7280] hover:text-[#1a1a2e]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <ScheduleDateNav />
    </div>
  );

  if (scheduleSubView === 'month') {
    return (
      <div>
        {tabStrip}
        <ScheduleMonthGrid />
      </div>
    );
  }

  if (scheduleSubView === 'week') {
    return (
      <div>
        {tabStrip}
        <ScheduleWeekView />
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {tabStrip}
      <div className="grid grid-cols-[1fr_240px] gap-4">
        <div
          className="rounded-[14px] overflow-hidden"
          style={{ background: '#fff', border: '1px solid #e5e7eb' }}
        >
          <div className="px-4 py-3 flex items-center justify-end border-b border-[#e5e7eb]">
            <div className="flex items-center gap-4 text-[11px] font-mono uppercase tracking-[1px] text-[#9ca3af]">
              <button
                onClick={() => setCreateOpen(true)}
                className="bg-[#1a1a2e] text-white text-[12px] font-bold px-3 py-1.5 rounded-full border-0 cursor-pointer normal-case tracking-normal hover:opacity-90"
              >
                + Create schedule
              </button>
              <SnapToggle
                mode={snapMode}
                onChange={(m) => void updatePrefs({ schedule_snap_mode: m })}
              />
              <span title="Planned = sum of scheduled block durations for this day.">
                Planned <span className="font-extrabold text-[#1a1a2e] tabular-nums normal-case">{fmtStat(plannedSeconds)}</span>
              </span>
              <span title="Tracked = time logged on this day, excluding breaks.">
                Tracked <span className="font-extrabold text-[#1a1a2e] tabular-nums normal-case">{fmtStat(trackedSeconds)}</span>
              </span>
            </div>
          </div>

          {/* Lane labels */}
          <div className="grid border-b border-[#f3f4f6]" style={{ gridTemplateColumns: '56px 1fr 1fr' }}>
            <div />
            <div className="text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af] px-2 py-1 border-r border-dashed border-[#e5e7eb]">
              Planned
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af] px-2 py-1">
              Tracked
            </div>
          </div>

          <div ref={dayBodyRef} className="relative">
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i).map((h) => (
              <HourRow
                key={h}
                hour={h}
                blocks={blocksByHour.get(h) ?? []}
                trackedRows={sessionsByHour.get(h) ?? []}
                tasks={tasks}
                tags={tags}
                nowMs={now.getTime()}
                snapMode={snapMode}
                onDelete={deletePlannedBlock}
                onUpdate={updatePlannedBlock}
                onMoveStart={handleMoveStart}
                draggingBlockId={dragPreview?.blockId ?? null}
              />
            ))}
            {dragPreview && (() => {
              const block = plannedBlocks.find((b) => b.id === dragPreview.blockId);
              if (!block) return null;
              const previewStart = new Date(dragPreview.startMs);
              const offsetMin =
                (previewStart.getHours() - START_HOUR) * 60 + previewStart.getMinutes();
              const topPx = (offsetMin / 60) * HOUR_HEIGHT;
              const heightPx = Math.max(14, (dragPreview.durationSec / 3600) * HOUR_HEIGHT);
              const task = tasks.find((t) => t.id === block.task_id);
              const subtask = block.subtask_id
                ? task?.subtasks.find((s) => s.id === block.subtask_id) ?? null
                : null;
              const tagColor =
                (task?.tag_ids[0] && tags.find((x) => x.id === task.tag_ids[0])?.color) ||
                '#1a1a2e';
              const label = subtask?.title ?? task?.title ?? 'Untitled block';
              const endMs = dragPreview.startMs + dragPreview.durationSec * 1000;
              const endD = new Date(endMs);
              const fmt = (d: Date) =>
                `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
              // Position in the Planned lane: left col 56px, planned lane is the
              // first 1fr of `56px 1fr 1fr`. Approximate by left=56px and width
              // = (gridWidth-56)/2. We use percentages so it stays in sync.
              return (
                <div
                  className="absolute pointer-events-none z-[3] rounded-lg px-2 py-1"
                  style={{
                    top: topPx,
                    height: heightPx - 2,
                    left: 'calc(56px + 4px)',
                    width: 'calc((100% - 56px) / 2 - 8px)',
                    background: '#fff',
                    borderLeft: `3px solid ${tagColor}`,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 0 0 1px #e5e7eb',
                    opacity: 0.95,
                  }}
                >
                  <div className="text-[11px] font-bold text-[#1a1a2e] truncate pr-2">
                    {label}
                  </div>
                  <div className="text-[10px] text-[#1a1a2e] tabular-nums font-semibold">
                    {fmt(previewStart)} → {fmt(endD)}
                  </div>
                </div>
              );
            })()}
            {nowWithinGrid && (
              <div
                className="absolute left-[56px] right-2 h-[2px] pointer-events-none z-10"
                style={{ top: nowOffsetPx, background: '#1a1a2e' }}
              >
                <div
                  className="absolute -left-1 -top-[4px] w-[10px] h-[10px] rounded-full"
                  style={{ background: '#1a1a2e' }}
                />
                <div className="absolute -right-[44px] -top-[10px] text-[10px] font-bold text-[#1a1a2e] tabular-nums">
                  {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af] mb-2">
            Drag a task →
          </div>
          <div className="mb-2">
            <SidebarStatusFilter value={sidebarStatus} onChange={setSidebarStatus} />
          </div>
          <div className="flex flex-col gap-[6px] max-h-[calc(100vh-200px)] overflow-y-auto">
            {sidebarTasks.length === 0 && (
              <div className="text-[12px] text-[#9ca3af] py-4 text-center">
                {sidebarStatus === 'done'
                  ? 'No completed tasks yet.'
                  : sidebarStatus === 'open'
                    ? 'No open tasks. Add one on the Board.'
                    : 'No tasks. Add one on the Board.'}
              </div>
            )}
            {sidebarTasks.map((t) => (
              <DraggableTaskWithSubtasks key={t.id} task={t} tags={tags} />
            ))}
          </div>
        </div>
      </div>
      <CreateScheduleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSavedForDate={(iso) => {
          const d = new Date(`${iso}T00:00:00`);
          d.setHours(0, 0, 0, 0);
          setDayStart(d);
        }}
      />
    </DndContext>
  );
}

function SnapToggle({
  mode,
  onChange,
}: {
  mode: ScheduleSnapMode;
  onChange: (m: ScheduleSnapMode) => void;
}) {
  const opts: { key: ScheduleSnapMode; label: string }[] = [
    { key: 'hour', label: '1 hr' },
    { key: '15min', label: '15 min' },
    { key: 'free', label: 'Free' },
  ];
  return (
    <div className="flex items-center rounded-md overflow-hidden border border-[#e5e7eb]">
      {opts.map((o) => {
        const active = mode === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            title={`Snap to ${o.label}`}
            className="text-[10px] font-mono uppercase tracking-[1px] px-2 py-[3px] cursor-pointer border-0"
            style={{
              background: active ? '#1a1a2e' : 'transparent',
              color: active ? '#fff' : '#71717a',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SidebarStatusFilter({
  value,
  onChange,
}: {
  value: 'open' | 'done' | 'all';
  onChange: (v: 'open' | 'done' | 'all') => void;
}) {
  const opts: { key: 'open' | 'done' | 'all'; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'done', label: 'Done' },
    { key: 'all', label: 'All' },
  ];
  return (
    <div className="flex items-center rounded-md overflow-hidden border border-[#e5e7eb] w-full">
      {opts.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            title={`Show ${o.label.toLowerCase()} tasks`}
            className="flex-1 text-[10px] font-mono uppercase tracking-[1px] px-2 py-[5px] cursor-pointer border-0"
            style={{
              background: active ? '#1a1a2e' : 'transparent',
              color: active ? '#fff' : '#71717a',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function HourRow({
  hour,
  blocks,
  trackedRows,
  tasks,
  tags,
  nowMs,
  snapMode,
  onDelete,
  onUpdate,
  onMoveStart,
  draggingBlockId,
}: {
  hour: number;
  blocks: PlannedBlock[];
  trackedRows: DaySessionRow[];
  tasks: TaskType[];
  tags: TagType[];
  nowMs: number;
  snapMode: ScheduleSnapMode;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PlannedBlock>) => Promise<void>;
  onMoveStart: (block: PlannedBlock, e: React.PointerEvent<HTMLDivElement>) => void;
  draggingBlockId: string | null;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `hour-${hour}` });
  return (
    <div className="grid" style={{ gridTemplateColumns: '56px 1fr 1fr', height: HOUR_HEIGHT }}>
      <div className="border-r border-[#f3f4f6] text-[11px] font-mono text-[#9ca3af] px-2 py-1 tabular-nums">
        {String(hour).padStart(2, '0')}:00
      </div>
      <div
        ref={setNodeRef}
        className="relative border-b border-dashed border-[#f3f4f6] border-r border-r-dashed border-r-[#e5e7eb] transition-colors"
        style={{
          background: isOver ? 'rgba(0,0,0,0.06)' : 'transparent',
          overflow: 'visible',
        }}
      >
        {blocks.map((b) => (
          <BlockCard
            key={b.id}
            block={b}
            tasks={tasks}
            tags={tags}
            hour={hour}
            snapMode={snapMode}
            isDraggingPreview={draggingBlockId === b.id}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onMoveStart={onMoveStart}
          />
        ))}
      </div>
      <div
        className="relative border-b border-dashed border-[#f3f4f6]"
        style={{ overflow: 'visible' }}
      >
        {trackedRows.map((s) => (
          <TrackedBar key={s.id} session={s} tasks={tasks} hour={hour} nowMs={nowMs} />
        ))}
      </div>
    </div>
  );
}

function BlockCard({
  block,
  tasks,
  tags,
  hour,
  snapMode,
  isDraggingPreview,
  onDelete,
  onUpdate,
  onMoveStart,
}: {
  block: PlannedBlock;
  tasks: TaskType[];
  tags: TagType[];
  hour: number;
  snapMode: ScheduleSnapMode;
  isDraggingPreview: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PlannedBlock>) => Promise<void>;
  onMoveStart: (block: PlannedBlock, e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const start = new Date(block.start_at);
  const task = tasks.find((t) => t.id === block.task_id);
  const subtask = block.subtask_id
    ? task?.subtasks.find((s) => s.id === block.subtask_id) ?? null
    : null;
  const tagColor =
    (task?.tag_ids[0] && tags.find((x) => x.id === task.tag_ids[0])?.color) || '#1a1a2e';

  const [liveDuration, setLiveDuration] = useState<number | null>(null);
  const effectiveDuration = liveDuration ?? block.duration_seconds;
  const [menuOpen, setMenuOpen] = useState(false);

  const topPx = (start.getMinutes() / 60) * HOUR_HEIGHT;
  const heightPx = Math.max(14, (effectiveDuration / 3600) * HOUR_HEIGHT);
  const endMinutes = start.getMinutes() + effectiveDuration / 60;
  const endHour = hour + Math.floor(endMinutes / 60);
  const endMin = Math.floor(endMinutes % 60);

  const primaryLabel = subtask?.title ?? task?.title ?? 'Untitled block';
  const secondaryLabel = subtask ? task?.title ?? null : null;

  const commitDuration = useCallback(
    (seconds: number) => {
      const clamped = Math.min(MAX_BLOCK_SECONDS, Math.max(MIN_BLOCK_SECONDS, seconds));
      if (clamped === block.duration_seconds) return;
      void onUpdate(block.id, { duration_seconds: clamped });
    },
    [block.id, block.duration_seconds, onUpdate],
  );

  const bumpDuration = (deltaMinutes: number) => {
    const next = effectiveDuration + deltaMinutes * 60;
    commitDuration(next);
  };

  // Resize: bottom 6px handle. Snap step now follows the user's snap mode.
  // Day-end clamp: end_at must not exceed END_HOUR:00.
  const blockStartMs = start.getTime();
  const dayEndForBlock = new Date(start);
  dayEndForBlock.setHours(END_HOUR, 0, 0, 0);
  const maxDurationByDay = Math.floor((dayEndForBlock.getTime() - blockStartMs) / 1000);

  const dragStateRef = useRef<{ startY: number; startSec: number } | null>(null);
  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = { startY: e.clientY, startSec: effectiveDuration };
  };
  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st) return;
    const deltaPx = e.clientY - st.startY;
    const deltaSec = (deltaPx / HOUR_HEIGHT) * 3600;
    const snapped = snapSec(st.startSec + deltaSec, snapMode);
    const clamped = Math.min(
      MAX_BLOCK_SECONDS,
      Math.min(maxDurationByDay, Math.max(MIN_BLOCK_SECONDS, snapped)),
    );
    setLiveDuration(clamped);
  };
  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    dragStateRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
    if (!st) return;
    const finalSec = liveDuration ?? st.startSec;
    setLiveDuration(null);
    commitDuration(finalSec);
  };

  return (
    <div
      onPointerDown={(e) => {
        // Only initiate move if pointerdown is on the body itself (not on
        // children that stopPropagation: resize handle, action buttons, menu).
        if (e.button !== 0) return;
        onMoveStart(block, e);
      }}
      className="absolute left-1 right-1 rounded-lg px-2 py-1 group z-[1] hover:z-[2]"
      style={{
        top: topPx,
        height: heightPx - 2,
        background: 'rgba(0,0,0,0.06)',
        borderLeft: `3px solid ${tagColor}`,
        cursor: isDraggingPreview ? 'grabbing' : 'grab',
        opacity: isDraggingPreview ? 0.4 : 1,
        touchAction: 'none',
      }}
      title={subtask ? `${task?.title ?? ''} — ${subtask.title}` : task?.title ?? 'Untitled'}
    >
      <div className="text-[11px] font-bold text-[#1a1a2e] truncate pr-14">
        {primaryLabel}
      </div>
      {secondaryLabel && heightPx > 34 && (
        <div className="text-[10px] text-[#9ca3af] truncate">↳ {secondaryLabel}</div>
      )}
      <div className="text-[10px] text-[#9ca3af] tabular-nums">
        {String(hour).padStart(2, '0')}:{String(start.getMinutes()).padStart(2, '0')} →{' '}
        {String(endHour).padStart(2, '0')}:{String(endMin).padStart(2, '0')}
        <span className="ml-1 text-[#d4d4d8]">· {Math.round(effectiveDuration / 60)}m</span>
      </div>

      <div
        className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            bumpDuration(-SNAP_MINUTES);
          }}
          title="Shorten by 15m"
          className="w-5 h-5 flex items-center justify-center text-[10px] text-[#71717a] hover:text-[#1a1a2e] bg-white/80 hover:bg-white rounded border border-[#e5e7eb] cursor-pointer"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            bumpDuration(SNAP_MINUTES);
          }}
          title="Extend by 15m"
          className="w-5 h-5 flex items-center justify-center text-[10px] text-[#71717a] hover:text-[#1a1a2e] bg-white/80 hover:bg-white rounded border border-[#e5e7eb] cursor-pointer"
        >
          ▼
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          title="Edit duration"
          className="w-5 h-5 flex items-center justify-center text-[10px] text-[#71717a] hover:text-[#1a1a2e] bg-white/80 hover:bg-white rounded border border-[#e5e7eb] cursor-pointer"
        >
          ✎
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(block.id);
          }}
          title="Remove from timeline"
          className="w-5 h-5 flex items-center justify-center text-[10px] text-[#d4d4d8] hover:text-[#dc2626] bg-white/80 hover:bg-white rounded border border-[#e5e7eb] cursor-pointer"
        >
          ×
        </button>
      </div>

      {menuOpen && (
        <div
          className="absolute right-1 top-7 z-20 bg-white rounded-md py-1 flex flex-col min-w-[110px]"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.12), 0 0 0 1px #e5e7eb' }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {DURATION_PRESETS_MIN.map((m) => {
            const active = Math.round(effectiveDuration / 60) === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  commitDuration(m * 60);
                  setMenuOpen(false);
                }}
                className="text-[11px] text-left px-3 py-1 hover:bg-[#f3f4f6] cursor-pointer bg-transparent border-0"
                style={{ color: '#1a1a2e', fontWeight: active ? 700 : 400 }}
              >
                {m < 60 ? `${m} min` : m === 60 ? '1 hour' : `${m / 60} hours`}
              </button>
            );
          })}
        </div>
      )}

      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        className="absolute left-0 right-0 bottom-0 h-[6px] cursor-ns-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to resize"
      >
        <div className="w-8 h-[3px] rounded-full bg-[#1a1a2e]/60" />
      </div>
    </div>
  );
}

function TrackedBar({
  session,
  tasks,
  hour,
  nowMs,
}: {
  session: DaySessionRow;
  tasks: TaskType[];
  hour: number;
  nowMs: number;
}) {
  const start = new Date(session.started_at);
  const isLive = session.ended_at === null;
  const endMs = session.ended_at ? new Date(session.ended_at).getTime() : nowMs;
  const durationSec = Math.max(0, Math.round((endMs - start.getTime()) / 1000));
  const heightPx = Math.max(8, (durationSec / 3600) * HOUR_HEIGHT);
  const topPx = (start.getMinutes() / 60) * HOUR_HEIGHT;

  const task = tasks.find((t) => t.id === session.task_id);
  const subtask = session.subtask_id
    ? task?.subtasks.find((s) => s.id === session.subtask_id) ?? null
    : null;
  const label = subtask?.title ?? task?.title ?? 'Untracked';
  const minutes = Math.round(durationSec / 60);
  const startStr = `${String(hour).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;

  return (
    <>
      {isLive && (
        <style>{`
          @keyframes scheduleTrackedPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.55; }
          }
        `}</style>
      )}
      <div
        className="absolute left-1 right-1 rounded-lg px-2 py-1 z-[1] overflow-hidden"
        style={{
          top: topPx,
          height: heightPx - 2,
          background: isLive ? '#1a1a2e' : 'rgba(26,26,46,0.85)',
          color: '#fff',
          animation: isLive ? 'scheduleTrackedPulse 1.6s ease-in-out infinite' : undefined,
        }}
        title={`${label} · ${startStr} · ${minutes}m${isLive ? ' (live)' : ''}`}
      >
        <div className="text-[11px] font-bold truncate">{label}</div>
        {heightPx > 28 && (
          <div className="text-[10px] tabular-nums" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {startStr} · {minutes}m{isLive ? ' · live' : ''}
          </div>
        )}
      </div>
    </>
  );
}

function DraggableTaskWithSubtasks({
  task,
  tags,
}: {
  task: TaskType;
  tags: TagType[];
}) {
  const openSubtasks = task.subtasks
    .filter((s) => !s.is_done)
    .sort((a, b) => a.sort_order - b.sort_order);
  const [expanded, setExpanded] = useState(false);
  const firstTag = tags.find((t) => t.id === task.tag_ids[0]);
  const accent = firstTag?.color ?? '#1a1a2e';
  const hasSubtasks = openSubtasks.length > 0;

  return (
    <div
      className="bg-white rounded-lg overflow-hidden"
      style={{
        borderLeft: `3px solid ${accent}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 0 0 1px #e5e7eb',
      }}
    >
      <div className="flex items-center gap-1 pl-1 pr-2 py-1">
        <button
          type="button"
          onClick={() => hasSubtasks && setExpanded((v) => !v)}
          disabled={!hasSubtasks}
          className="w-5 h-5 flex items-center justify-center text-[11px] text-[#9ca3af] hover:text-[#1a1a2e] rounded bg-transparent border-0 shrink-0"
          style={{ cursor: hasSubtasks ? 'pointer' : 'default', opacity: hasSubtasks ? 1 : 0.3 }}
          title={hasSubtasks ? (expanded ? 'Hide subtasks' : 'Show subtasks') : 'No open subtasks'}
          aria-label="Toggle subtasks"
        >
          {expanded ? '▾' : '▸'}
        </button>
        <DraggableTaskHandle taskId={task.id} title={task.title} tagLabel={firstTag} />
        {hasSubtasks && (
          <span className="text-[10px] font-mono text-[#9ca3af] shrink-0 px-1 tabular-nums">
            {openSubtasks.length}
          </span>
        )}
      </div>
      {expanded && hasSubtasks && (
        <div className="flex flex-col gap-[4px] px-2 pb-2 pl-6 border-t border-dashed border-[#e5e7eb] pt-2">
          {openSubtasks.map((s) => (
            <DraggableSubtask key={s.id} taskId={task.id} subtask={s} accent={accent} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraggableTaskHandle({
  taskId,
  title,
  tagLabel,
}: {
  taskId: string;
  title: string;
  tagLabel: TagType | undefined;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task__${taskId}`,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="flex-1 min-w-0"
      style={{ cursor: 'grab', opacity: isDragging ? 0.4 : 1, touchAction: 'none' }}
    >
      <div className="text-[12px] font-semibold text-[#1a1a2e] truncate">
        {title}
      </div>
      {tagLabel && (
        <div className="text-[10px] mt-0.5" style={{ color: tagLabel.color }}>
          {tagLabel.name}
        </div>
      )}
    </div>
  );
}

function DraggableSubtask({
  taskId,
  subtask,
  accent,
}: {
  taskId: string;
  subtask: SubtaskType;
  accent: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `subtask__${taskId}__${subtask.id}`,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="text-[11px] text-[#1a1a2e] bg-[#fafafa] hover:bg-[#f3f4f6] rounded px-2 py-1 flex items-center gap-2"
      style={{
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        touchAction: 'none',
      }}
      title={`Drag subtask: ${subtask.title}`}
    >
      <span
        className="inline-block w-[6px] h-[6px] rounded-full shrink-0"
        style={{ background: accent }}
      />
      <span className="truncate">{subtask.title}</span>
    </div>
  );
}
