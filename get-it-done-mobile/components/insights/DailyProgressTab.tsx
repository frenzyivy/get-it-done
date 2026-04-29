import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { WhenYouWorkCard } from './WhenYouWorkCard';
import { StreakHistoryCard } from './StreakHistoryCard';
import type { TrackedSession } from '@/types';

// Phase 7 step A2 — Daily Progress tab on mobile. Mirrors the web layout
// (streak ring + 3 stat cards + Today so far list). Heatmap and streak
// history line chart are deferred to a future mobile pass — those are
// SVG-heavy and the data can stay web-only for v1.

const DAILY_TARGET = 5;

// Same FONT/Palette tokens as InsightsView so cards visually match.
const FONT = {
  r: 'WorkSans_400Regular',
  m: 'WorkSans_500Medium',
  sb: 'WorkSans_600SemiBold',
  b: 'WorkSans_700Bold',
  xb: 'WorkSans_800ExtraBold',
};

const LIGHT = {
  card: '#FFFFFF',
  border: '#ECE9F7',
  ink: '#1A1730',
  ink2: '#5B5674',
  ink3: '#8E89A8',
  inkDark: '#1a1a2e',
  ringTrack: 'rgba(255,255,255,0.18)',
};
const DARK = {
  card: '#1B1B21',
  border: '#2E2D34',
  ink: '#E4E1E9',
  ink2: '#B8B4C6',
  ink3: '#8A8698',
  inkDark: '#1a1a2e',
  ringTrack: 'rgba(255,255,255,0.18)',
};
type Palette = typeof LIGHT;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeekSunday(d: Date): Date {
  const out = new Date(d);
  out.setDate(d.getDate() - d.getDay());
  out.setHours(0, 0, 0, 0);
  return out;
}

function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return '0m';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

export function DailyProgressTab() {
  const theme = useTheme();
  const C: Palette = theme.dark ? DARK : LIGHT;
  const tasks = useStore((s) => s.tasks);
  const profileV2 = useStore((s) => s.profileV2);

  const stats = useMemo(() => {
    const now = new Date();
    const todayKey = ymd(now);

    const thisWeekStart = startOfWeekSunday(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const todayPlanned = tasks.filter((t) => t.planned_for_date === todayKey);
    const todayDone = todayPlanned.filter(
      (t) => t.effective_status === 'done',
    ).length;

    const doneInRange = (start: Date, end: Date): number => {
      let n = 0;
      const startMs = start.getTime();
      const endMs = end.getTime();
      for (const t of tasks) {
        if (t.effective_status !== 'done') continue;
        if (!t.completed_at) continue;
        const ts = Date.parse(t.completed_at);
        if (Number.isFinite(ts) && ts >= startMs && ts < endMs) n++;
      }
      return n;
    };

    const thisWeekDone = doneInRange(thisWeekStart, new Date(now.getTime() + 1000));
    const lastWeekDone = doneInRange(lastWeekStart, thisWeekStart);
    const last30Done = doneInRange(thirtyDaysAgo, new Date(now.getTime() + 1000));

    const daysWithDone = new Set<string>();
    for (const t of tasks) {
      if (t.effective_status !== 'done' || !t.completed_at) continue;
      const ts = Date.parse(t.completed_at);
      if (!Number.isFinite(ts)) continue;
      if (ts < thirtyDaysAgo.getTime()) continue;
      daysWithDone.add(ymd(new Date(ts)));
    }
    const completionRate = Math.round((daysWithDone.size / 30) * 100);

    return {
      todayDone,
      todayPlanned: todayPlanned.length,
      thisWeekDone,
      lastWeekDone,
      thisWeekTarget: DAILY_TARGET * 7,
      avg30: (last30Done / 30).toFixed(1),
      completionRate,
    };
  }, [tasks]);

  const currentStreak = profileV2?.current_streak ?? 0;
  const longestStreak = profileV2?.longest_streak ?? 0;
  const hoursRemaining = Math.max(0, DAILY_TARGET - stats.todayDone);
  const weekDelta = stats.thisWeekDone - stats.lastWeekDone;

  return (
    <View style={{ gap: 12 }}>
      {/* Top row — streak ring (compact card) + 3 stat cards in a 2×2 wrap */}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
        <StreakRingCard
          C={C}
          current={currentStreak}
          longest={longestStreak}
        />
        <View style={{ flex: 1, gap: 8 }}>
          <StatCard
            C={C}
            label="Today"
            value={`${stats.todayDone} / ${DAILY_TARGET}`}
            sub={
              hoursRemaining > 0
                ? `${hoursRemaining} more to hit goal`
                : 'goal hit ✓'
            }
          />
          <StatCard
            C={C}
            label="This week"
            value={`${stats.thisWeekDone} / ${stats.thisWeekTarget}`}
            sub={
              stats.thisWeekTarget > 0
                ? `${Math.round((stats.thisWeekDone / stats.thisWeekTarget) * 100)}% of weekly goal`
                : undefined
            }
            delta={
              weekDelta !== 0
                ? { value: weekDelta, positive: weekDelta > 0 }
                : null
            }
          />
        </View>
      </View>
      <StatCard
        C={C}
        label="30-day average"
        value={`${stats.avg30} / ${DAILY_TARGET}`}
        sub={`${stats.completionRate}% completion rate`}
      />
      <TodaySoFarCard C={C} />
      <WhenYouWorkCard />
      <StreakHistoryCard />
    </View>
  );
}

function nextMilestone(current: number): number {
  const ms = [5, 10, 25, 50, 100, 250, 500, 1000];
  for (const m of ms) {
    if (m > current) return m;
  }
  return current + 100;
}

function StreakRingCard({
  C,
  current,
  longest,
}: {
  C: Palette;
  current: number;
  longest: number;
}) {
  const SIZE = 88;
  const STROKE = 5;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const target = nextMilestone(current);
  const ratio = target > 0 ? Math.min(1, current / target) : 0;
  const dashOffset = CIRC * (1 - ratio);

  return (
    <View
      style={{
        width: 132,
        backgroundColor: C.inkDark,
        borderRadius: 14,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill={C.inkDark}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
        />
        <G rotation={-90} originX={SIZE / 2} originY={SIZE / 2}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="#fff"
            strokeWidth={STROKE}
            strokeDasharray={`${CIRC},${CIRC}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </G>
        <SvgText
          x={SIZE / 2}
          y={SIZE / 2 + 9}
          textAnchor="middle"
          fontSize={26}
          fontWeight="800"
          fill="#fff"
        >
          {current}
        </SvgText>
      </Svg>
      <Text
        style={{
          color: 'rgba(255,255,255,0.55)',
          fontSize: 9,
          letterSpacing: 1,
          marginTop: 6,
          fontWeight: '700',
        }}
      >
        DAY STREAK
      </Text>
      <Text
        style={{
          color: 'rgba(255,255,255,0.45)',
          fontSize: 9,
          marginTop: 2,
        }}
      >
        best yet · {longest}d
      </Text>
    </View>
  );
}

function StatCard({
  C,
  label,
  value,
  sub,
  delta,
}: {
  C: Palette;
  label: string;
  value: string;
  sub?: string;
  delta?: { value: number; positive: boolean } | null;
}) {
  return (
    <View
      style={{
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 12,
        padding: 12,
        flex: 1,
        justifyContent: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text
          style={{
            fontFamily: FONT.m,
            fontSize: 9,
            color: C.ink3,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
        {delta && (
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              color: delta.positive ? '#10b981' : '#dc2626',
              fontVariant: ['tabular-nums'],
            }}
          >
            {delta.positive ? '↑' : '↓'} {Math.abs(delta.value)}
          </Text>
        )}
      </View>
      <Text
        style={{
          fontFamily: FONT.xb,
          fontSize: 20,
          color: C.ink,
          marginTop: 2,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      {sub && (
        <Text
          style={{
            fontFamily: FONT.m,
            fontSize: 10,
            color: C.ink3,
            marginTop: 2,
          }}
        >
          {sub}
        </Text>
      )}
    </View>
  );
}

interface SessionRow {
  id: string;
  task_id: string | null;
  subtask_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

function TodaySoFarCard({ C }: { C: Palette }) {
  const userId = useStore((s) => s.userId);
  const tasks = useStore((s) => s.tasks);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    // Pull today's sessions directly from Supabase (RLS-scoped to the user).
    // Mobile doesn't have a /api/sessions/by-day-detailed endpoint hook, but
    // RLS lets the JS client read tracked_sessions directly. We fetch a 36h
    // window starting 24h ago and filter to today's calendar in JS, which
    // covers any tz quirks without an extra round-trip.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    supabase
      .from('tracked_sessions')
      .select('id, task_id, subtask_id, started_at, ended_at, duration_seconds')
      .eq('user_id', userId)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[DailyProgressTab.TodaySoFar]', error.message);
          setSessions([]);
        } else {
          const todayKey = ymd(new Date());
          const filtered = ((data ?? []) as SessionRow[]).filter((s) => {
            const startMs = Date.parse(s.started_at);
            if (!Number.isFinite(startMs)) return false;
            return ymd(new Date(startMs)) === todayKey;
          });
          setSessions(filtered);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const totalToday = useMemo(() => {
    if (!sessions) return 0;
    return sessions.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  }, [sessions]);

  return (
    <View
      style={{
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 14,
        padding: 14,
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
        <View>
          <Text style={{ fontFamily: FONT.b, fontSize: 14, color: C.ink }}>
            Today so far
          </Text>
          <Text style={{ fontFamily: FONT.m, fontSize: 11, color: C.ink3, marginTop: 2 }}>
            Tracked sessions today
          </Text>
        </View>
        <Text
          style={{
            fontFamily: FONT.xb,
            fontSize: 16,
            color: C.ink,
            fontVariant: ['tabular-nums'],
          }}
        >
          {fmtDuration(totalToday)}
        </Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <ActivityIndicator size="small" />
        </View>
      ) : !sessions || sessions.length === 0 ? (
        <Text
          style={{
            fontFamily: FONT.m,
            fontSize: 12,
            color: C.ink3,
            textAlign: 'center',
            paddingVertical: 14,
          }}
        >
          No tracked time yet today.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {sessions.slice(0, 8).map((s) => {
            const task = tasks.find((t) => t.id === s.task_id);
            const subtask = s.subtask_id
              ? task?.subtasks.find((x) => x.id === s.subtask_id)
              : null;
            const label = subtask
              ? `${task?.title ?? 'Untitled'} → ${subtask.title}`
              : task?.title ?? 'Untracked';
            const startedAt = new Date(s.started_at);
            const startStr = startedAt.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            });
            const isLive = s.ended_at === null;
            const durationSec =
              s.duration_seconds ??
              Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000));
            return (
              <View
                key={s.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 4,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: isLive ? '#10b981' : C.ink3,
                  }}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontFamily: FONT.m,
                    fontSize: 12,
                    color: C.ink,
                  }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontFamily: FONT.m,
                    fontSize: 10,
                    color: C.ink3,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {startStr}
                </Text>
                <Text
                  style={{
                    fontFamily: FONT.b,
                    fontSize: 11,
                    color: C.ink2,
                    fontVariant: ['tabular-nums'],
                    minWidth: 42,
                    textAlign: 'right',
                  }}
                >
                  {fmtDuration(durationSec)}
                </Text>
              </View>
            );
          })}
          {sessions.length > 8 && (
            <Text
              style={{
                fontFamily: FONT.m,
                fontSize: 10,
                color: C.ink3,
                textAlign: 'center',
                marginTop: 4,
              }}
            >
              + {sessions.length - 8} more sessions
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// Re-export TrackedSession so any future caller of this module gets it without
// re-importing from types.
export type { TrackedSession };
