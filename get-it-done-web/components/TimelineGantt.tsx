'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtShort } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { useLiveTimers } from '@/lib/useLiveTimer';
import { EditTaskDrawer } from './EditTaskDrawer';
import type { PlannedBlock, TrackedSession } from '@/types';

// Feature 1 — Gantt-style horizontal day view.
//
// Two tracks:
//  • Planned (top, lighter) — planned_blocks for the day
//  • Actual  (bottom, solid) — tracked_sessions for the day
//
// X-axis is auto-bounded by the data: 1h before earliest entry to
// max(now, last entry + 1h), with an 8h minimum window so a single 41m
// session doesn't render as an unreadable thumbnail.

interface Props {
  dayStart: Date;
  plannedBlocks: PlannedBlock[];
  sessions: TrackedSession[];
  highlightSessionId?: string | null;
  onHighlightClear?: () => void;
  // Called after an Adjust/Delete so the parent can refetch sessions. Optional
  // because TimelineGantt is also rendered in places that pull from the store.
  onSessionsChanged?: () => void;
}

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PX_PER_HOUR = 120; // fixed horizontal scale → full day is 2880px wide
const DAY_WIDTH_PX = 24 * PX_PER_HOUR;
const LEFT_GUTTER = 36;
const TRACK_HEIGHT = 28;
const PLANNED_TRACK_TOP = 36;
const ACTUAL_TRACK_TOP = 76;
const MIN_BLOCK_PX = 32; // spec: minimum block width 32px on mobile

interface BlockMeta {
  id: string;
  taskId: string | null;
  title: string;
  subtitle: string;
  startMs: number;
  endMs: number;
  color: string;
  // New-spec-1 Feature 4 — which sub-lane inside the Actual track this block
  // lives in. Single lane when nothing overlaps; auto-stacked when it does.
  lane?: number;
}

export function TimelineGantt({
  dayStart,
  plannedBlocks,
  sessions,
  highlightSessionId,
  onHighlightClear,
  onSessionsChanged,
}: Props) {
  const tasks = useStore((s) => s.tasks);
  const tags = useStore((s) => s.tags);
  const activeSessions = useStore((s) => s.activeSessions);
  const elapsedMap = useLiveTimers();
  const updateSessionTimes = useStore((s) => s.updateSessionTimes);
  const deleteSession = useStore((s) => s.deleteSession);
  const stopSession = useStore((s) => s.stopSession);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  // `nowMs` is sampled once and ticked every minute. Storing it as state keeps
  // every Date.now() reference out of the render body (React Compiler purity).
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [hover, setHover] = useState<{ x: number; meta: BlockMeta } | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didCenterRef = useRef(false);

  // Build planned + actual block metadata up front so bounds + render share data.
  const plannedMeta: BlockMeta[] = useMemo(
    () =>
      plannedBlocks.map((b) => {
        const task = tasks.find((t) => t.id === b.task_id);
        const color =
          (task?.tag_ids[0] && tags.find((x) => x.id === task.tag_ids[0])?.color) ||
          '#8b5cf6';
        const start = new Date(b.start_at).getTime();
        return {
          id: `p-${b.id}`,
          taskId: b.task_id,
          title: task?.title ?? 'Planned block',
          subtitle: `${fmtShort(b.duration_seconds)} planned`,
          startMs: start,
          endMs: start + b.duration_seconds * 1000,
          color,
        };
      }),
    [plannedBlocks, tasks, tags],
  );

  const actualMeta: BlockMeta[] = useMemo(() => {
    const liveIds = new Set(activeSessions.map((a) => a.id));
    const blocks: BlockMeta[] = [];
    for (const s of sessions) {
      const task = tasks.find((t) => t.id === s.task_id);
      const sub = task?.subtasks.find((x) => x.id === s.subtask_id);
      const start = new Date(s.started_at).getTime();
      const isLive = !s.ended_at && liveIds.has(s.id);

      // Only paint blocks for time the user actually reported:
      //  • live timer  → cap at LIVE_CAP_SECONDS. A timer left running for
      //    hours is almost always abandoned (tab open, user away). We can't
      //    tell "actually working" from "walked away", so we hard-cap the
      //    visual so untracked hours don't get painted as work.
      //  • ended session with duration_seconds → use that as-is.
      //  • orphaned session (no end, not live) → skip entirely so we don't
      //    paint a giant bar from started_at to "now".
      const LIVE_CAP_SECONDS = 45 * 60;
      let dur: number;
      if (isLive) {
        const rawElapsed = elapsedMap[s.id] ?? Math.floor((nowMs - start) / 1000);
        dur = Math.min(rawElapsed, LIVE_CAP_SECONDS);
      } else if (typeof s.duration_seconds === 'number' && s.duration_seconds > 0) {
        dur = s.duration_seconds;
      } else {
        continue;
      }

      const matchedPlanned = plannedMeta.find(
        (p) =>
          p.taskId === s.task_id &&
          start < p.endMs &&
          start + dur * 1000 > p.startMs,
      );
      let color: string;
      if (isLive) color = '#8b5cf6';
      else if (matchedPlanned) color = '#10b981';
      else color = '#a855f7';
      blocks.push({
        id: `a-${s.id}`,
        taskId: s.task_id,
        title: task?.title ?? 'Deleted task',
        subtitle: sub ? `→ ${sub.title}` : 'Whole task',
        startMs: start,
        endMs: start + dur * 1000,
        color,
      });
    }

    // New-spec-1 Feature 4 — lane-stacking. Greedy first-fit: for each block
    // sorted by start, place it in the lowest-indexed lane whose last block
    // ended before this one starts. Overlaps spread across lanes.
    const sorted = [...blocks].sort((a, b) => a.startMs - b.startMs);
    const laneEnds: number[] = [];
    const laneOf = new Map<string, number>();
    for (const b of sorted) {
      let placed = false;
      for (let i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] <= b.startMs) {
          laneEnds[i] = b.endMs;
          laneOf.set(b.id, i);
          placed = true;
          break;
        }
      }
      if (!placed) {
        laneOf.set(b.id, laneEnds.length);
        laneEnds.push(b.endMs);
      }
    }
    return blocks.map((b) => ({ ...b, lane: laneOf.get(b.id) ?? 0 }));
  }, [sessions, tasks, plannedMeta, activeSessions, elapsedMap, nowMs]);

  // Total number of lanes the Actual track needs to accommodate overlaps.
  const actualLaneCount = useMemo(
    () => Math.max(1, ...actualMeta.map((a) => (a.lane ?? 0) + 1)),
    [actualMeta],
  );

  // Full 24h window anchored to the day. The scroll container handles clipping;
  // the inner canvas is always DAY_WIDTH_PX wide so 1h == PX_PER_HOUR px.
  const windowStartMs = dayStart.getTime();
  const windowEndMs = windowStartMs + DAY_MS;
  const totalMs = DAY_MS;

  // Hour ticks across the full 24h window.
  const ticks = useMemo(() => {
    const out: { ms: number; label: string }[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = windowStartMs + i * HOUR_MS;
      out.push({
        ms: t,
        label: new Date(t).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    }
    return out;
  }, [windowStartMs]);

  const showNow = nowMs >= windowStartMs && nowMs <= windowEndMs;

  // Auto-center the scroll on "now" the first time the canvas mounts with a
  // valid width. Runs once per session — user scrolling thereafter is preserved.
  useEffect(() => {
    if (didCenterRef.current) return;
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const nowPx = LEFT_GUTTER + ((nowMs - windowStartMs) / HOUR_MS) * PX_PER_HOUR;
    const target = Math.max(0, nowPx - el.clientWidth / 2);
    el.scrollLeft = target;
    didCenterRef.current = true;
  }, [nowMs, windowStartMs]);

  const xPct = (ms: number) => ((ms - windowStartMs) / totalMs) * 100;
  const xPx = (ms: number) => ((ms - windowStartMs) / HOUR_MS) * PX_PER_HOUR;

  // Width as percent, then enforce a 32px minimum after layout (via min-width).
  const renderBlock = (
    meta: BlockMeta,
    top: number,
    opacity: number,
    onClick: (() => void) | null,
    overlay = false,
    heightOverride?: number,
  ) => {
    const left = xPct(meta.startMs);
    const width = xPct(meta.endMs) - left;
    const isHighlighted = highlightSessionId && meta.id === `a-${highlightSessionId}`;
    return (
      <div
        key={meta.id}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.parentElement!.getBoundingClientRect();
          setHover({ x: e.clientX - rect.left, meta });
        }}
        onMouseLeave={() => setHover(null)}
        onClick={onClick ?? undefined}
        className="absolute rounded-md transition-all"
        style={{
          left: `${left}%`,
          width: `calc(${width}% )`,
          minWidth: MIN_BLOCK_PX,
          top,
          height: heightOverride ?? TRACK_HEIGHT,
          background: meta.color,
          opacity,
          cursor: onClick ? 'pointer' : 'default',
          outline: isHighlighted ? '2px solid #f59e0b' : overlay ? '1.5px solid #dc2626' : 'none',
          outlineOffset: isHighlighted ? 2 : 0,
          boxShadow: isHighlighted ? '0 4px 14px rgba(245,158,11,0.4)' : undefined,
        }}
        title={`${meta.title} • ${new Date(meta.startMs).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        })}–${new Date(meta.endMs).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        })}`}
      />
    );
  };

  // Empty state only when BOTH tracks empty (per spec).
  if (plannedMeta.length === 0 && actualMeta.length === 0) {
    return (
      <div className="bg-white rounded-[14px] p-6 text-center text-[#aaa] text-sm shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
        No data for this day. Start tracking to see your plan vs reality.
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-extrabold uppercase tracking-[0.5px] text-[#1a1a2e]">
            {dayStart.toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
            })}
          </div>
          <div className="flex gap-3 text-[10px] text-[#888]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded-sm bg-[#8b5cf6] opacity-30" />
              Planned
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded-sm bg-[#10b981]" />
              On plan
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded-sm bg-[#a855f7]" />
              Off plan
            </span>
          </div>
        </div>

        <div ref={scrollRef} className="overflow-x-auto">
        <div className="relative" style={{ height: 130, width: LEFT_GUTTER + DAY_WIDTH_PX }}>
          {/* Hour gridlines + labels */}
          {ticks.map((t) => (
            <div
              key={t.ms}
              className="absolute top-[24px] bottom-0 border-l border-dashed border-[#eee]"
              style={{ left: LEFT_GUTTER + xPx(t.ms) }}
            >
              <div className="absolute -top-[20px] -translate-x-1/2 text-[10px] text-[#888] whitespace-nowrap">
                {t.label}
              </div>
            </div>
          ))}

          {/* Track labels */}
          <div
            className="absolute left-0 text-[10px] font-bold uppercase tracking-[0.5px] text-[#888]"
            style={{ top: PLANNED_TRACK_TOP + TRACK_HEIGHT / 2 - 6 }}
          >
            Plan
          </div>
          <div
            className="absolute left-0 text-[10px] font-bold uppercase tracking-[0.5px] text-[#888]"
            style={{ top: ACTUAL_TRACK_TOP + TRACK_HEIGHT / 2 - 6 }}
          >
            Actual
          </div>

          {/* Track backgrounds */}
          <div
            className="absolute rounded-md bg-[#f9fafb]"
            style={{ left: LEFT_GUTTER, width: DAY_WIDTH_PX, top: PLANNED_TRACK_TOP, height: TRACK_HEIGHT }}
          />
          <div
            className="absolute rounded-md bg-[#f9fafb]"
            style={{ left: LEFT_GUTTER, width: DAY_WIDTH_PX, top: ACTUAL_TRACK_TOP, height: TRACK_HEIGHT }}
          />

          {/* The blocks themselves live in an absolute layer that respects the
              gutter under the track labels. */}
          <div className="absolute" style={{ left: LEFT_GUTTER, width: DAY_WIDTH_PX, top: 0, bottom: 0 }}>
            {plannedMeta.map((p) =>
              renderBlock(
                p,
                PLANNED_TRACK_TOP,
                0.35,
                p.taskId ? () => setOpenTaskId(p.taskId!) : null,
              ),
            )}
            {actualMeta.map((a) => {
              const planned = plannedMeta.find(
                (p) => p.taskId === a.taskId && a.startMs < p.endMs && a.endMs > p.startMs,
              );
              const overran = !!planned && a.endMs > planned.endMs;
              // Feature 4 lane-stacking: split the 28px Actual track into
              // `actualLaneCount` sub-lanes and shrink each block to fit.
              const laneHeight = TRACK_HEIGHT / actualLaneCount;
              const top = ACTUAL_TRACK_TOP + (a.lane ?? 0) * laneHeight;
              // Actual-track click opens the Adjust popover (edit/delete the
              // session). Held-down-timer accidents are the whole reason this
              // exists, so we don't route to the task drawer here.
              const sessionId = a.id.startsWith('a-') ? a.id.slice(2) : null;
              return renderBlock(
                a,
                top,
                1,
                sessionId ? () => setEditingSessionId(sessionId) : null,
                overran,
                laneHeight,
              );
            })}

            {/* Feature 4 — 2×/3× badge on the Actual track when we were
                multi-tasking, anchored at the left of the overlap region. */}
            {actualLaneCount > 1 && (
              <div
                className="absolute text-[9px] font-extrabold uppercase tracking-[0.5px] text-white bg-[#a855f7] rounded-md px-[5px] py-[1px]"
                style={{
                  top: ACTUAL_TRACK_TOP - 14,
                  left: 0,
                }}
                title={`Up to ${actualLaneCount} timers ran concurrently`}
              >
                {actualLaneCount}× multitasking
              </div>
            )}

            {/* "Now" line */}
            {showNow && (
              <div
                className="absolute top-[24px] bottom-0 w-[2px] bg-[#dc2626] pointer-events-none"
                style={{ left: `${xPct(nowMs)}%` }}
              >
                <div className="absolute -top-[4px] -left-[3px] w-2 h-2 rounded-full bg-[#dc2626]" />
              </div>
            )}

            {/* Tooltip */}
            {hover && (
              <div
                className="absolute z-20 pointer-events-none bg-[#1a1a2e] text-white text-[11px] rounded-md px-2 py-1 shadow-lg"
                style={{
                  left: Math.min(hover.x, 1000),
                  top: ACTUAL_TRACK_TOP + TRACK_HEIGHT + 6,
                  whiteSpace: 'nowrap',
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="font-bold">{hover.meta.title}</div>
                <div className="opacity-80">{hover.meta.subtitle}</div>
                <div className="opacity-70">
                  {new Date(hover.meta.startMs).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  –{' '}
                  {new Date(hover.meta.endMs).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {fmtShort(Math.round((hover.meta.endMs - hover.meta.startMs) / 1000))}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>

        {highlightSessionId && (
          <div className="mt-3 text-right">
            <button
              onClick={onHighlightClear}
              className="text-[11px] text-[#888] hover:text-[#1a1a2e] bg-transparent border-0 cursor-pointer"
            >
              Clear highlight
            </button>
          </div>
        )}
      </div>

      {openTaskId && (
        <EditTaskDrawer
          key={openTaskId}
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
        />
      )}

      {editingSessionId && (
        <AdjustSessionModal
          session={
            sessions.find((s) => s.id === editingSessionId) ??
            activeSessions.find((s) => s.id === editingSessionId) ??
            null
          }
          taskTitle={
            (() => {
              const sess =
                sessions.find((s) => s.id === editingSessionId) ??
                activeSessions.find((s) => s.id === editingSessionId);
              return tasks.find((t) => t.id === sess?.task_id)?.title ?? 'Session';
            })()
          }
          onClose={() => setEditingSessionId(null)}
          onStopLive={async () => {
            await stopSession(editingSessionId);
            setEditingSessionId(null);
            onSessionsChanged?.();
          }}
          onSave={async (startedAt, endedAt) => {
            await updateSessionTimes(editingSessionId, startedAt, endedAt);
            setEditingSessionId(null);
            onSessionsChanged?.();
          }}
          onDelete={async () => {
            await deleteSession(editingSessionId);
            setEditingSessionId(null);
            onSessionsChanged?.();
          }}
        />
      )}
    </>
  );
}

// Modal for adjusting a single tracked session — edit start/end or delete.
// Kept as a local component so TimelineGantt stays self-contained.
function AdjustSessionModal({
  session,
  taskTitle,
  onClose,
  onStopLive,
  onSave,
  onDelete,
}: {
  session: TrackedSession | null;
  taskTitle: string;
  onClose: () => void;
  onStopLive: () => Promise<void>;
  onSave: (startedAtISO: string, endedAtISO: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const isLive = !!session && !session.ended_at;
  const fallbackEnd = session
    ? new Date(
        new Date(session.started_at).getTime() +
          ((session.duration_seconds ?? 0) * 1000 || 60 * 60 * 1000),
      ).toISOString()
    : new Date().toISOString();
  const initialStart = session ? toLocalInputValue(session.started_at) : '';
  const initialEnd = session
    ? toLocalInputValue(session.ended_at ?? fallbackEnd)
    : '';
  const [startVal, setStartVal] = useState(initialStart);
  const [endVal, setEndVal] = useState(initialEnd);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session) return null;

  const handleSave = async () => {
    setErr(null);
    const startISO = fromLocalInputValue(startVal);
    const endISO = fromLocalInputValue(endVal);
    if (!startISO || !endISO) {
      setErr('Please fill both times.');
      return;
    }
    if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
      setErr('End must be after start.');
      return;
    }
    setBusy(true);
    try {
      await onSave(startISO, endISO);
    } catch (e) {
      setErr((e as Error).message || 'Save failed.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[14px] p-5 w-[360px] max-w-[92vw] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[13px] font-extrabold uppercase tracking-[0.5px] text-[#1a1a2e] mb-1">
          Adjust session
        </div>
        <div className="text-[12px] text-[#888] mb-4 truncate">{taskTitle}</div>

        {isLive && (
          <div className="mb-4 p-2 rounded-md bg-[#fef3c7] text-[11px] text-[#78350f]">
            This timer is still running. Stop it first, or just delete it.
          </div>
        )}

        <label className="block text-[11px] font-bold uppercase tracking-[0.5px] text-[#888] mb-1">
          Start
        </label>
        <input
          type="datetime-local"
          value={startVal}
          onChange={(e) => setStartVal(e.target.value)}
          disabled={isLive}
          className="w-full mb-3 px-2 py-2 border border-[#e5e7eb] rounded-md text-[13px] disabled:bg-[#f3f4f6]"
        />

        <label className="block text-[11px] font-bold uppercase tracking-[0.5px] text-[#888] mb-1">
          End
        </label>
        <input
          type="datetime-local"
          value={endVal}
          onChange={(e) => setEndVal(e.target.value)}
          disabled={isLive}
          className="w-full mb-3 px-2 py-2 border border-[#e5e7eb] rounded-md text-[13px] disabled:bg-[#f3f4f6]"
        />

        {err && <div className="text-[11px] text-[#dc2626] mb-2">{err}</div>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onDelete}
            disabled={busy}
            className="px-3 py-2 text-[12px] font-bold rounded-md bg-[#fee2e2] text-[#991b1b] hover:bg-[#fecaca] disabled:opacity-50"
          >
            Delete
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 text-[12px] rounded-md bg-[#f3f4f6] text-[#1a1a2e] hover:bg-[#e5e7eb] disabled:opacity-50"
          >
            Cancel
          </button>
          {isLive ? (
            <button
              onClick={onStopLive}
              disabled={busy}
              className="px-3 py-2 text-[12px] font-bold rounded-md bg-[#1a1a2e] text-white hover:opacity-90 disabled:opacity-50"
            >
              Stop now
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={busy}
              className="px-3 py-2 text-[12px] font-bold rounded-md bg-[#1a1a2e] text-white hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time.
// These two helpers round-trip between that and an ISO string.
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
