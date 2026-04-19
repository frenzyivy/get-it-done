import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import { useLiveTimers } from '@/lib/useLiveTimer';
import { useUI } from '@/lib/ui-context';
import { fmtShort } from '@/lib/utils';
import type { PlannedBlock, TrackedSession } from '@/types';

// Feature 1 (mobile) — Gantt-style horizontal day view.
//
// Two horizontal tracks (Planned on top, Actual on bottom). Auto-bounded x-axis
// with an 8-hour minimum window. Tap a block to open the edit sheet for that
// task. Below the chart is a tappable detail line that updates as you scrub
// across blocks (RN doesn't really do hover, so this is the mobile analog).
//
// Width: the inner content is 800px wide so it scrolls horizontally on small
// devices — matches the spec's "horizontal scroll is acceptable" line.

interface Props {
  dayStart: Date;
  plannedBlocks: PlannedBlock[];
  sessions: TrackedSession[];
  highlightSessionId?: string | null;
}

const MIN_WINDOW_MS = 8 * 3600 * 1000;
const TRACK_HEIGHT = 26;
const PLANNED_TRACK_TOP = 30;
const ACTUAL_TRACK_TOP = 66;
const CHART_HEIGHT = 110;
const CHART_WIDTH = 800; // px — scrolls horizontally on phone
const MIN_BLOCK_PX = 32;

interface BlockMeta {
  id: string;
  taskId: string | null;
  title: string;
  subtitle: string;
  startMs: number;
  endMs: number;
  color: string;
  durationSec: number;
  lane?: number;
}

export function TimelineGantt({
  dayStart,
  plannedBlocks,
  sessions,
  highlightSessionId,
}: Props) {
  const tasks = useStore((s) => s.tasks);
  const tags = useStore((s) => s.tags);
  const activeSessions = useStore((s) => s.activeSessions);
  const elapsedMap = useLiveTimers();
  const { openEditTask } = useUI();

  // `nowMs` is sampled in state and ticked every minute — keeps Date.now() out
  // of the render path and lets the now-line and live block grow on schedule.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [selected, setSelected] = useState<BlockMeta | null>(null);

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
          durationSec: b.duration_seconds,
        };
      }),
    [plannedBlocks, tasks, tags],
  );

  const actualMeta: BlockMeta[] = useMemo(() => {
    const liveIds = new Set(activeSessions.map((a) => a.id));
    const built = sessions.map((s) => {
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
        durationSec: dur,
      } as BlockMeta;
    });
    // Feature 4 lane-stacking: greedy first-fit.
    const sorted = [...built].sort((a, b) => a.startMs - b.startMs);
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
    return built.map((b) => ({ ...b, lane: laneOf.get(b.id) ?? 0 }));
  }, [sessions, tasks, plannedMeta, activeSessions, elapsedMap, nowMs]);

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
    let startMs = minStart - 60 * 60 * 1000;
    let endMs = maxEnd + 60 * 60 * 1000;
    if (endMs - startMs < MIN_WINDOW_MS) {
      const pad = (MIN_WINDOW_MS - (endMs - startMs)) / 2;
      startMs -= pad;
      endMs += pad;
    }
    const snapMs = 30 * 60 * 1000;
    startMs = Math.floor(startMs / snapMs) * snapMs;
    endMs = Math.ceil(endMs / snapMs) * snapMs;
    return { windowStartMs: startMs, windowEndMs: endMs };
  }, [plannedMeta, actualMeta, dayStart, nowMs]);

  const totalMs = windowEndMs - windowStartMs;

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

  const xPx = (ms: number) => ((ms - windowStartMs) / totalMs) * CHART_WIDTH;
  const showNow = nowMs >= windowStartMs && nowMs <= windowEndMs;

  // Empty state — only when both tracks are empty (per spec).
  if (plannedMeta.length === 0 && actualMeta.length === 0) {
    return (
      <View
        style={{
          backgroundColor: '#fff',
          padding: 20,
          borderRadius: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#aaa', fontSize: 13, textAlign: 'center' }}>
          No data for this day. Start tracking to see your plan vs reality.
        </Text>
      </View>
    );
  }

  const renderBlock = (
    meta: BlockMeta,
    top: number,
    opacity: number,
    overran: boolean,
    heightOverride?: number,
  ) => {
    const left = xPx(meta.startMs);
    const width = Math.max(MIN_BLOCK_PX, xPx(meta.endMs) - left);
    const isHi =
      highlightSessionId && meta.id === `a-${highlightSessionId}`;
    return (
      <Pressable
        key={meta.id}
        onPress={() => {
          setSelected(meta);
          if (meta.taskId) openEditTask(meta.taskId);
        }}
        style={{
          position: 'absolute',
          left,
          width,
          top,
          height: heightOverride ?? TRACK_HEIGHT,
          backgroundColor: meta.color,
          opacity,
          borderRadius: 6,
          borderWidth: isHi ? 2 : overran ? 1.5 : 0,
          borderColor: isHi ? '#f59e0b' : overran ? '#dc2626' : 'transparent',
        }}
      />
    );
  };

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: '800',
            color: '#1a1a2e',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {dayStart.toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
          })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Legend color="rgba(139,92,246,0.35)" label="Plan" />
          <Legend color="#10b981" label="On" />
          <Legend color="#a855f7" label="Off" />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width: CHART_WIDTH, height: CHART_HEIGHT }}>
          {/* Hour tick labels */}
          {ticks.map((t) => (
            <View
              key={t.ms}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: xPx(t.ms),
                borderLeftWidth: 1,
                borderColor: '#eee',
                borderStyle: 'dashed',
              }}
            >
              <Text
                style={{
                  position: 'absolute',
                  top: 2,
                  left: -14,
                  fontSize: 9,
                  color: '#888',
                  width: 36,
                }}
              >
                {t.label}
              </Text>
            </View>
          ))}

          {/* Track backgrounds */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: PLANNED_TRACK_TOP,
              height: TRACK_HEIGHT,
              backgroundColor: '#f9fafb',
              borderRadius: 6,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: ACTUAL_TRACK_TOP,
              height: TRACK_HEIGHT,
              backgroundColor: '#f9fafb',
              borderRadius: 6,
            }}
          />

          {/* Blocks */}
          {plannedMeta.map((p) => renderBlock(p, PLANNED_TRACK_TOP, 0.35, false))}
          {(() => {
            const laneCount = Math.max(
              1,
              ...actualMeta.map((a) => (a.lane ?? 0) + 1),
            );
            const laneHeight = TRACK_HEIGHT / laneCount;
            return actualMeta.map((a) => {
              const planned = plannedMeta.find(
                (p) =>
                  p.taskId === a.taskId && a.startMs < p.endMs && a.endMs > p.startMs,
              );
              const overran = !!planned && a.endMs > planned.endMs;
              const top = ACTUAL_TRACK_TOP + (a.lane ?? 0) * laneHeight;
              return renderBlock(a, top, 1, overran, laneHeight);
            });
          })()}

          {/* Now line */}
          {showNow && (
            <View
              style={{
                position: 'absolute',
                top: 18,
                bottom: 0,
                left: xPx(nowMs),
                width: 2,
                backgroundColor: '#dc2626',
              }}
            />
          )}
        </View>
      </ScrollView>

      {selected && (
        <View
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 8,
            backgroundColor: '#1a1a2e',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
            {selected.title}
          </Text>
          <Text style={{ color: '#fff', fontSize: 11, opacity: 0.85 }}>
            {selected.subtitle}
          </Text>
          <Text style={{ color: '#fff', fontSize: 11, opacity: 0.7 }}>
            {new Date(selected.startMs).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            –{' '}
            {new Date(selected.endMs).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            · {fmtShort(selected.durationSec)}
          </Text>
        </View>
      )}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 10,
          height: 6,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
      <Text style={{ fontSize: 10, color: '#888' }}>{label}</Text>
    </View>
  );
}
