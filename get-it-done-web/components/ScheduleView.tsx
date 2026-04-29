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
import { fmtShort } from '@/lib/utils';
import type { PlannedBlock, SubtaskType, TagType, TaskType } from '@/types';

const HOUR_HEIGHT = 56; // px per hour row
const START_HOUR = 6;
const END_HOUR = 23; // exclusive — shows up to 22:00 slot
const SNAP_MINUTES = 15;
const MIN_BLOCK_SECONDS = 15 * 60;
const DEFAULT_BLOCK_SECONDS = 30 * 60;
const DURATION_PRESETS_MIN = [15, 30, 45, 60, 90, 120, 180] as const;

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

export function ScheduleView() {
  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const addPlannedBlock = useStore((s) => s.addPlannedBlock);
  const updatePlannedBlock = useStore((s) => s.updatePlannedBlock);
  const deletePlannedBlock = useStore((s) => s.deletePlannedBlock);
  const daySessions = useStore((s) => s.daySessions);
  const fetchDaySessions = useStore((s) => s.fetchDaySessions);
  const tags = useStore((s) => s.tags);
  const userId = useStore((s) => s.userId);
  const activeSessions = useStore((s) => s.activeSessions);

  const [now, setNow] = useState(() => new Date());

  const dayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const dayEnd = useMemo(() => {
    const d = new Date(dayStart);
    d.setDate(d.getDate() + 1);
    return d;
  }, [dayStart]);
  const dayKey = useMemo(() => ymdLocal(dayStart), [dayStart]);

  useEffect(() => {
    if (!userId) return;
    void fetchPlannedBlocks(dayStart.toISOString(), dayEnd.toISOString());
    void fetchDaySessions(dayKey);
  }, [userId, fetchPlannedBlocks, fetchDaySessions, dayStart, dayEnd, dayKey]);

  // Refetch tracked sessions every minute while a session is active so the
  // current bar grows in near-real-time. When nothing is live, no refetch.
  useEffect(() => {
    if (activeSessions.length === 0) return;
    const id = setInterval(() => {
      void fetchDaySessions(dayKey, true);
    }, 60_000);
    return () => clearInterval(id);
  }, [activeSessions.length, fetchDaySessions, dayKey]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const openTasks = useMemo(
    () => tasks.filter((t) => t.effective_status !== 'done'),
    [tasks],
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

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const activeId = String(e.active.id);
    const targetHour = Number(String(e.over.id).replace('hour-', ''));
    if (!Number.isFinite(targetHour)) return;

    // Drag IDs:
    //   `task__<taskId>`             — task palette → schedule (creates block)
    //   `subtask__<taskId>__<subId>` — subtask palette → schedule (creates block)
    //   `block__<blockId>`           — existing block being rescheduled
    if (activeId.startsWith('block__')) {
      const blockId = activeId.slice('block__'.length);
      const block = plannedBlocks.find((b) => b.id === blockId);
      if (!block) return;
      const startAt = new Date(dayStart);
      const existingMinutes = new Date(block.start_at).getMinutes();
      startAt.setHours(targetHour, existingMinutes, 0, 0);
      const newStartIso = startAt.toISOString();
      if (newStartIso === block.start_at) return;
      void updatePlannedBlock(blockId, { start_at: newStartIso });
      return;
    }

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
  const trackedSeconds = useMemo(() => {
    if (!daySessions) return 0;
    let total = 0;
    const nowMs = now.getTime();
    for (const s of daySessions.sessions) {
      const start = new Date(s.started_at).getTime();
      const end = s.ended_at ? new Date(s.ended_at).getTime() : nowMs;
      // Clip to today's window so a midnight-crosser doesn't double count.
      const dayStartMs = dayStart.getTime();
      const dayEndMs = dayEnd.getTime();
      const clipped = Math.max(0, Math.min(end, dayEndMs) - Math.max(start, dayStartMs));
      total += Math.round(clipped / 1000);
    }
    return total;
  }, [daySessions, dayStart, dayEnd, now]);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-[1fr_240px] gap-4">
        <div
          className="rounded-[14px] overflow-hidden"
          style={{ background: '#fff', border: '1px solid #e5e7eb' }}
        >
          <div className="px-4 py-3 flex items-center justify-between border-b border-[#e5e7eb]">
            <div className="text-[13px] font-extrabold uppercase tracking-[0.5px] text-[#1a1a2e]">
              {dayStart.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono uppercase tracking-[1px] text-[#9ca3af]">
              <span>
                Planned <span className="font-extrabold text-[#1a1a2e] tabular-nums normal-case">{fmtShort(plannedSeconds)}</span>
              </span>
              <span>
                Tracked <span className="font-extrabold text-[#1a1a2e] tabular-nums normal-case">{fmtShort(trackedSeconds)}</span>
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

          <div className="relative">
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i).map((h) => (
              <HourRow
                key={h}
                hour={h}
                blocks={blocksByHour.get(h) ?? []}
                trackedRows={sessionsByHour.get(h) ?? []}
                tasks={tasks}
                tags={tags}
                nowMs={now.getTime()}
                onDelete={deletePlannedBlock}
                onUpdate={updatePlannedBlock}
              />
            ))}
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
          <div className="flex flex-col gap-[6px] max-h-[calc(100vh-200px)] overflow-y-auto">
            {openTasks.length === 0 && (
              <div className="text-[12px] text-[#9ca3af] py-4 text-center">
                No open tasks. Add one on the Board.
              </div>
            )}
            {openTasks.map((t) => (
              <DraggableTaskWithSubtasks key={t.id} task={t} tags={tags} />
            ))}
          </div>
        </div>
      </div>
    </DndContext>
  );
}

function HourRow({
  hour,
  blocks,
  trackedRows,
  tasks,
  tags,
  nowMs,
  onDelete,
  onUpdate,
}: {
  hour: number;
  blocks: PlannedBlock[];
  trackedRows: DaySessionRow[];
  tasks: TaskType[];
  tags: TagType[];
  nowMs: number;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PlannedBlock>) => Promise<void>;
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
            onDelete={onDelete}
            onUpdate={onUpdate}
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
  onDelete,
  onUpdate,
}: {
  block: PlannedBlock;
  tasks: TaskType[];
  tags: TagType[];
  hour: number;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PlannedBlock>) => Promise<void>;
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

  // Make the block itself draggable to reschedule. The resize handle and the
  // top-right buttons stop propagation so they don't trigger a drag.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `block__${block.id}`,
  });

  const commitDuration = useCallback(
    (seconds: number) => {
      const clamped = Math.max(MIN_BLOCK_SECONDS, seconds);
      if (clamped === block.duration_seconds) return;
      void onUpdate(block.id, { duration_seconds: clamped });
    },
    [block.id, block.duration_seconds, onUpdate],
  );

  const bumpDuration = (deltaMinutes: number) => {
    const next = effectiveDuration + deltaMinutes * 60;
    commitDuration(next);
  };

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
    const snap = SNAP_MINUTES * 60;
    const snapped = Math.round((st.startSec + deltaSec) / snap) * snap;
    setLiveDuration(Math.max(MIN_BLOCK_SECONDS, snapped));
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
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute left-1 right-1 rounded-lg px-2 py-1 group z-[1] hover:z-[2]"
      style={{
        top: topPx,
        height: heightPx - 2,
        background: 'rgba(0,0,0,0.06)',
        borderLeft: `3px solid ${tagColor}`,
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.4 : 1,
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
