'use client';

import { useEffect, useMemo, useState } from 'react';
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
}

const MIN_WINDOW_MS = 8 * 3600 * 1000;
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
}: Props) {
  const tasks = useStore((s) => s.tasks);
  const tags = useStore((s) => s.tags);
  const activeSessions = useStore((s) => s.activeSessions);
  const elapsedMap = useLiveTimers();

  // `nowMs` is sampled once and ticked every minute. Storing it as state keeps
  // every Date.now() reference out of the render body (React Compiler purity).
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [hover, setHover] = useState<{ x: number; meta: BlockMeta } | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

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
    const blocks = sessions.map((s) => {
      const task = tasks.find((t) => t.id === s.task_id);
      const sub = task?.subtasks.find((x) => x.id === s.subtask_id);
      const start = new Date(s.started_at).getTime();
      const isLive = !s.ended_at && liveIds.has(s.id);
      const dur = isLive
        ? elapsedMap[s.id] ?? Math.floor((nowMs - start) / 1000)
        : s.duration_seconds ?? Math.floor((nowMs - start) / 1000);
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
      return {
        id: `a-${s.id}`,
        taskId: s.task_id,
        title: task?.title ?? 'Deleted task',
        subtitle: sub ? `→ ${sub.title}` : 'Whole task',
        startMs: start,
        endMs: start + dur * 1000,
        color,
      } as BlockMeta;
    });

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

  // Auto-bound the x-axis. If no data fall back to dayStart..dayStart+8h.
  const { windowStartMs, windowEndMs } = useMemo(() => {
    const all = [...plannedMeta, ...actualMeta];
    if (all.length === 0) {
      return {
        windowStartMs: dayStart.getTime(),
        windowEndMs: dayStart.getTime() + MIN_WINDOW_MS,
      };
    }
    const minStart = Math.min(...all.map((b) => b.startMs));
    const maxEnd = Math.max(...all.map((b) => b.endMs), nowMs);
    let startMs = minStart - 60 * 60 * 1000; // 1h before
    let endMs = maxEnd + 60 * 60 * 1000; // 1h after
    if (endMs - startMs < MIN_WINDOW_MS) {
      // Pad symmetrically to reach the 8h minimum.
      const pad = (MIN_WINDOW_MS - (endMs - startMs)) / 2;
      startMs -= pad;
      endMs += pad;
    }
    // Snap start down to a half-hour boundary for cleaner ticks.
    const snapMs = 30 * 60 * 1000;
    startMs = Math.floor(startMs / snapMs) * snapMs;
    endMs = Math.ceil(endMs / snapMs) * snapMs;
    return { windowStartMs: startMs, windowEndMs: endMs };
  }, [plannedMeta, actualMeta, dayStart, nowMs]);

  const totalMs = windowEndMs - windowStartMs;

  // Hour ticks within the window.
  const ticks = useMemo(() => {
    const out: { ms: number; label: string }[] = [];
    const HOUR = 3600 * 1000;
    const first = Math.ceil(windowStartMs / HOUR) * HOUR;
    for (let t = first; t <= windowEndMs; t += HOUR) {
      out.push({
        ms: t,
        label: new Date(t).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    }
    return out;
  }, [windowStartMs, windowEndMs]);

  const showNow = nowMs >= windowStartMs && nowMs <= windowEndMs;

  const xPct = (ms: number) => ((ms - windowStartMs) / totalMs) * 100;

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
      <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] overflow-x-auto">
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

        <div className="relative min-w-[640px]" style={{ height: 130 }}>
          {/* Hour gridlines + labels */}
          {ticks.map((t) => (
            <div
              key={t.ms}
              className="absolute top-[24px] bottom-0 border-l border-dashed border-[#eee]"
              style={{ left: `${xPct(t.ms)}%` }}
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
            style={{ left: 36, right: 0, top: PLANNED_TRACK_TOP, height: TRACK_HEIGHT }}
          />
          <div
            className="absolute rounded-md bg-[#f9fafb]"
            style={{ left: 36, right: 0, top: ACTUAL_TRACK_TOP, height: TRACK_HEIGHT }}
          />

          {/* The blocks themselves live in an absolute layer that respects the
              gutter under the track labels. */}
          <div className="absolute" style={{ left: 36, right: 0, top: 0, bottom: 0 }}>
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
              return renderBlock(
                a,
                top,
                1,
                a.taskId ? () => setOpenTaskId(a.taskId!) : null,
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
    </>
  );
}
