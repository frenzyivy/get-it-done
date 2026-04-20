import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { type as M3Type } from '@/lib/theme';
import { DailySummaryCard } from './DailySummaryCard';
import type { PlannedBlock, TrackedSession } from '@/types';

const DAY_MS = 24 * 3600 * 1000;
const SHAPE_W = 320;
const SHAPE_H = 100;
const DAYS_BACK = 7;

function fmtShortMono(sec: number): string {
  if (!sec || sec <= 0) return '0m';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

function fmtHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function hueColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h}, 60%, 55%)`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dateKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

export function TimelineView() {
  const theme = useTheme();
  const c = theme.colors;
  const driftRed = theme.dark ? '#F87171' : '#DC2626';

  const userId = useStore((s) => s.userId);
  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const profileV2 = useStore((s) => s.profileV2);

  const dayStart = useMemo(() => startOfDay(new Date()), []);
  const dayEnd = useMemo(() => new Date(dayStart.getTime() + DAY_MS), [dayStart]);

  // 7-day window for Day Shape
  const weekStart = useMemo(
    () => new Date(dayStart.getTime() - (DAYS_BACK - 1) * DAY_MS),
    [dayStart],
  );
  const weekEnd = dayEnd; // exclusive upper bound of today

  useEffect(() => {
    if (!userId) return;
    void fetchPlannedBlocks(dayStart.toISOString(), dayEnd.toISOString());
  }, [userId, fetchPlannedBlocks, dayStart, dayEnd]);

  // Today's sessions (for cards + off-plan list)
  const [sessions, setSessions] = useState<TrackedSession[]>([]);
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const { data } = await supabase
        .from('tracked_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', dayStart.toISOString())
        .lt('started_at', dayEnd.toISOString())
        .order('started_at', { ascending: true });
      setSessions((data ?? []) as TrackedSession[]);
    })();
  }, [userId, dayStart, dayEnd]);

  // 7-day sessions + planned blocks for Day Shape stacked bars
  const [weekSessions, setWeekSessions] = useState<TrackedSession[]>([]);
  const [weekPlanned, setWeekPlanned] = useState<PlannedBlock[]>([]);
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const [sessRes, planRes] = await Promise.all([
        supabase
          .from('tracked_sessions')
          .select('*')
          .eq('user_id', userId)
          .gte('started_at', weekStart.toISOString())
          .lt('started_at', weekEnd.toISOString()),
        supabase
          .from('planned_blocks')
          .select('*')
          .eq('user_id', userId)
          .gte('start_at', weekStart.toISOString())
          .lt('start_at', weekEnd.toISOString()),
      ]);
      setWeekSessions((sessRes.data ?? []) as TrackedSession[]);
      setWeekPlanned((planRes.data ?? []) as PlannedBlock[]);
    })();
  }, [userId, weekStart, weekEnd]);

  // Today's completed-task count + yesterday's for delta
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [completedYesterdayCount, setCompletedYesterdayCount] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const yesterdayStart = new Date(dayStart.getTime() - DAY_MS);
    void (async () => {
      const [todayRes, yestRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'done')
          .gte('updated_at', dayStart.toISOString())
          .lt('updated_at', dayEnd.toISOString()),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'done')
          .gte('updated_at', yesterdayStart.toISOString())
          .lt('updated_at', dayStart.toISOString()),
      ]);
      setCompletedTodayCount(todayRes.count ?? 0);
      setCompletedYesterdayCount(yestRes.count ?? 0);
    })();
  }, [userId, dayStart, dayEnd]);

  const totalPlanned = plannedBlocks.reduce((s, b) => s + b.duration_seconds, 0);
  const totalTracked = sessions.reduce(
    (s, x) => s + (x.duration_seconds ?? 0),
    0,
  );
  const driftedSec = sessions
    .filter((s) => !s.planned_block_id && s.ended_at)
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const offPlan = sessions.filter((s) => !s.planned_block_id && s.ended_at);
  const offPlanCount = offPlan.length;

  // Focus score: (tracked / planned) * 100, capped at 100. If no plan, 0.
  const focusScore =
    totalPlanned > 0
      ? Math.min(100, Math.round((totalTracked / totalPlanned) * 100))
      : 0;

  const streak = profileV2?.current_streak ?? 0;
  const delta = completedTodayCount - completedYesterdayCount;

  // Day Shape bars: one column per day in the 7-day window.
  const dayShape = useMemo(() => {
    const days: {
      key: string;
      label: string;
      plannedSec: number;
      onPlanSec: number;
      driftSec: number;
    }[] = [];
    for (let i = 0; i < DAYS_BACK; i++) {
      const d = new Date(weekStart.getTime() + i * DAY_MS);
      const k = dateKey(d);
      days.push({ key: k, label: String(d.getDate()), plannedSec: 0, onPlanSec: 0, driftSec: 0 });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    for (const p of weekPlanned) {
      const k = dateKey(new Date(p.start_at));
      const bucket = byKey.get(k);
      if (bucket) bucket.plannedSec += p.duration_seconds;
    }
    for (const s of weekSessions) {
      if (!s.duration_seconds || !s.ended_at) continue;
      const k = dateKey(new Date(s.started_at));
      const bucket = byKey.get(k);
      if (!bucket) continue;
      if (s.planned_block_id) bucket.onPlanSec += s.duration_seconds;
      else bucket.driftSec += s.duration_seconds;
    }
    return days;
  }, [weekPlanned, weekSessions, weekStart]);

  const maxBarSec = Math.max(
    1,
    ...dayShape.map((d) => Math.max(d.plannedSec, d.onPlanSec + d.driftSec)),
  );
  const rangeLabel = `${weekStart.getDate()} — ${dayStart.getDate()}`;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 16 }}>
      <DailySummaryCard />

      {/* 1 — Tasks Completed + Streak/Focus cards */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {/* Tasks Completed */}
        <View
          style={{
            flex: 1,
            backgroundColor: c.elevation.level1,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: c.outlineVariant,
          }}
        >
          <Text
            style={{
              ...M3Type.labelMedium,
              color: c.onSurfaceVariant,
              textTransform: 'uppercase',
            }}
          >
            Tasks completed
          </Text>
          <Text
            style={{
              fontSize: 34,
              lineHeight: 40,
              fontWeight: '700',
              color: c.onSurface,
              fontVariant: ['tabular-nums'],
              marginTop: 6,
            }}
          >
            {completedTodayCount}
          </Text>
          <Text
            style={{
              ...M3Type.bodySmall,
              color:
                delta > 0
                  ? theme.dark
                    ? '#6FE39B'
                    : '#0F7A4B'
                  : c.onSurfaceVariant,
              marginTop: 4,
            }}
          >
            {delta > 0
              ? `+${delta} from yesterday`
              : delta < 0
              ? `${delta} from yesterday`
              : 'Same as yesterday'}
          </Text>
        </View>

        {/* Streak + Focus Score */}
        <View
          style={{
            flex: 1,
            backgroundColor: c.elevation.level1,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: c.outlineVariant,
          }}
        >
          <Text
            style={{
              ...M3Type.labelMedium,
              color: c.onSurfaceVariant,
              textTransform: 'uppercase',
            }}
          >
            Streak
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <Text
              style={{
                fontSize: 34,
                lineHeight: 40,
                fontWeight: '700',
                color: c.onSurface,
                fontVariant: ['tabular-nums'],
              }}
            >
              {streak}
            </Text>
            <Text style={{ ...M3Type.bodySmall, color: c.onSurfaceVariant }}>
              day{streak === 1 ? '' : 's'}
            </Text>
          </View>
          <Text
            style={{
              ...M3Type.bodySmall,
              color: c.onSurfaceVariant,
              marginTop: 6,
              fontVariant: ['tabular-nums'],
            }}
          >
            Focus {focusScore}/100
          </Text>
        </View>
      </View>

      {/* 2 — Day shape: 7-day stacked bars (plan bg, executed fill, drift cap) */}
      <View
        style={{
          backgroundColor: c.elevation.level1,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: c.outlineVariant,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 10,
          }}
        >
          <Text
            style={{
              ...M3Type.labelMedium,
              color: c.onSurfaceVariant,
              textTransform: 'uppercase',
            }}
          >
            Day shape
          </Text>
          <Text
            style={{
              ...M3Type.bodySmall,
              color: c.onSurfaceVariant,
              fontVariant: ['tabular-nums'],
            }}
          >
            {rangeLabel}
          </Text>
        </View>
        <Svg
          width="100%"
          height={SHAPE_H + 20}
          viewBox={`0 0 ${SHAPE_W} ${SHAPE_H + 20}`}
          preserveAspectRatio="none"
        >
          {/* Baseline */}
          <Line
            x1={0}
            x2={SHAPE_W}
            y1={SHAPE_H}
            y2={SHAPE_H}
            stroke={c.outlineVariant}
            strokeWidth={1}
          />
          {dayShape.map((d, i) => {
            const colW = SHAPE_W / DAYS_BACK;
            const barW = colW * 0.55;
            const x = i * colW + (colW - barW) / 2;
            const planH = (d.plannedSec / maxBarSec) * (SHAPE_H - 4);
            const onPlanH = (d.onPlanSec / maxBarSec) * (SHAPE_H - 4);
            const driftH = (d.driftSec / maxBarSec) * (SHAPE_H - 4);
            return (
              <Svg key={d.key} x={0} y={0}>
                {/* Plan background */}
                {planH > 0 && (
                  <Rect
                    x={x}
                    y={SHAPE_H - planH}
                    width={barW}
                    height={planH}
                    rx={3}
                    fill={c.outlineVariant}
                    opacity={0.55}
                  />
                )}
                {/* Executed (on-plan) */}
                {onPlanH > 0 && (
                  <Rect
                    x={x}
                    y={SHAPE_H - onPlanH}
                    width={barW}
                    height={onPlanH}
                    rx={3}
                    fill={c.primary}
                  />
                )}
                {/* Drift cap (stacks on top of on-plan) */}
                {driftH > 0 && (
                  <Rect
                    x={x}
                    y={SHAPE_H - onPlanH - driftH}
                    width={barW}
                    height={driftH}
                    rx={3}
                    fill={driftRed}
                  />
                )}
              </Svg>
            );
          })}
        </Svg>
        {/* Date labels under the bars */}
        <View
          style={{
            flexDirection: 'row',
            marginTop: 4,
          }}
        >
          {dayShape.map((d) => (
            <Text
              key={`lbl-${d.key}`}
              style={{
                flex: 1,
                textAlign: 'center',
                ...M3Type.labelSmall,
                color: c.onSurfaceVariant,
                fontVariant: ['tabular-nums'],
              }}
            >
              {d.label}
            </Text>
          ))}
        </View>
      </View>

      {/* 3 — Off-plan list (today) */}
      {offPlanCount > 0 && (
        <View style={{ gap: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: 4,
            }}
          >
            <Text
              style={{
                ...M3Type.labelMedium,
                color: c.onSurfaceVariant,
                textTransform: 'uppercase',
              }}
            >
              Off plan
            </Text>
            <Text
              style={{
                ...M3Type.labelMedium,
                color: c.onSurfaceVariant,
                fontVariant: ['tabular-nums'],
              }}
            >
              {fmtShortMono(driftedSec)} · {offPlanCount}{' '}
              {offPlanCount === 1 ? 'entry' : 'entries'}
            </Text>
          </View>

          <View
            style={{
              backgroundColor: c.elevation.level1,
              borderRadius: 16,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: c.outlineVariant,
            }}
          >
            {offPlan.map((s, i) => {
              const task = tasks.find((t) => t.id === s.task_id);
              const title = task?.title ?? 'Deleted task';
              const dot = hueColor(task?.tag_ids[0] ?? title);
              return (
                <View key={s.id}>
                  {i > 0 && (
                    <View style={{ height: 1, backgroundColor: c.outlineVariant }} />
                  )}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        minWidth: 0,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: dot,
                        }}
                      />
                      <Text
                        numberOfLines={1}
                        style={{ ...M3Type.bodyLarge, color: c.onSurface, flex: 1 }}
                      >
                        {title}
                      </Text>
                    </View>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}
                    >
                      <Text
                        style={{
                          ...M3Type.bodySmall,
                          color: c.onSurfaceVariant,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {fmtHHMM(s.started_at)}
                      </Text>
                      <Text
                        style={{
                          ...M3Type.labelLarge,
                          color: driftRed,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {fmtShortMono(s.duration_seconds ?? 0)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
