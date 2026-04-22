import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { fetchInsights } from '@/lib/insights';
import type {
  InsightsBucket,
  InsightsPayload,
  InsightsProjectBucket,
  InsightsRange,
  InsightsTagBucket,
  InsightsTask,
  TrackedSession,
} from '@/types';

// Palette — light and dark variants switched from theme.dark.
const LIGHT = {
  bg: '#F6F5FF',
  card: '#FFFFFF',
  border: '#ECE9F7',
  borderSoft: '#F2F0FA',
  ink: '#1A1730',
  ink2: '#5B5674',
  ink3: '#8E89A8',
  purple: '#7C5CFF',
  purpleStrong: '#5A3FD8',
  purpleSoft: '#E6DAFC',
  purpleTint: '#EFEAFF',
  purpleDim: '#D6CEF5',
  orange: '#EA580C',
  orangeTint: '#FDE5D8',
  green: '#16A34A',
  red: '#DC2626',
  chipBg: '#F2F0FA',
};
const DARK = {
  bg: '#131317',
  card: '#1B1B21',
  border: '#2E2D34',
  borderSoft: '#25242A',
  ink: '#E4E1E9',
  ink2: '#B8B4C6',
  ink3: '#8A8698',
  purple: '#A593FF',
  purpleStrong: '#C8BFFF',
  purpleSoft: '#3B27B5',
  purpleTint: '#24203A',
  purpleDim: '#3B3560',
  orange: '#F97316',
  orangeTint: '#3A2418',
  green: '#6FE39B',
  red: '#F87171',
  chipBg: '#25242A',
};
type Palette = typeof LIGHT;

const FONT = {
  r: 'WorkSans_400Regular',
  m: 'WorkSans_500Medium',
  sb: 'WorkSans_600SemiBold',
  b: 'WorkSans_700Bold',
  xb: 'WorkSans_800ExtraBold',
};

const RANGES: { key: InsightsRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 3600 * 1000;

function fmtDuration(sec: number): string {
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

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dateKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

// ── Subtitle / range label ─────────────────────────────────────────────────
function rangeSubtitle(p: InsightsPayload): string {
  const end = new Date(p.range_end);
  if (p.range === 'today') {
    return `${MONTHS[end.getMonth()]} ${end.getDate()}`;
  }
  if (p.range === 'all' || !p.range_start) {
    return 'All time';
  }
  const start = new Date(p.range_start);
  if (p.range === 'week') {
    // Both days in the same month per week semantics.
    return `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]}`;
  }
  // month
  return `${MONTHS[start.getMonth()]} ${start.getDate()} — ${end.getDate()}`;
}

// ── Day-shape bucketing ────────────────────────────────────────────────────
type ShapeBucket = { key: string; label: string; sec: number; highlight: boolean };

function bucketForRange(
  range: InsightsRange,
  sessions: TrackedSession[],
  rangeStart: Date | null,
  rangeEnd: Date,
): { buckets: ShapeBucket[]; axisLabels: (string | null)[] } {
  const now = rangeEnd;

  if (range === 'today') {
    // 24 hourly bars for today (00–23), highlight current hour.
    const start = startOfDay(now);
    const arr: ShapeBucket[] = Array.from({ length: 24 }, (_, h) => ({
      key: `h${h}`,
      label: String(h).padStart(2, '0'),
      sec: 0,
      highlight: h === now.getHours(),
    }));
    for (const s of sessions) {
      if (!s.duration_seconds || !s.ended_at) continue;
      const sd = new Date(s.started_at);
      if (sd < start) continue;
      arr[sd.getHours()].sec += s.duration_seconds;
    }
    // Show every third hour on the axis so it stays readable.
    const axis = arr.map((_, i) => (i % 6 === 0 ? String(i).padStart(2, '0') : null));
    return { buckets: arr, axisLabels: axis };
  }

  if (range === 'week') {
    // 7 daily bars, today highlighted.
    const start = rangeStart ? startOfDay(rangeStart) : startOfDay(new Date(now.getTime() - 6 * DAY_MS));
    const todayKey = dateKey(now);
    const arr: ShapeBucket[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getTime() + i * DAY_MS);
      const k = dateKey(d);
      arr.push({ key: k, label: String(d.getDate()), sec: 0, highlight: k === todayKey });
    }
    const byKey = new Map(arr.map((b) => [b.key, b]));
    for (const s of sessions) {
      if (!s.duration_seconds || !s.ended_at) continue;
      const k = dateKey(new Date(s.started_at));
      const b = byKey.get(k);
      if (b) b.sec += s.duration_seconds;
    }
    return { buckets: arr, axisLabels: arr.map((b) => b.label) };
  }

  if (range === 'month') {
    // Daily bars from range_start to today; show first/mid/last label only.
    const start = rangeStart ? startOfDay(rangeStart) : startOfDay(new Date(now.getTime() - 29 * DAY_MS));
    const todayKey = dateKey(now);
    const days = Math.max(1, Math.round((startOfDay(now).getTime() - start.getTime()) / DAY_MS) + 1);
    const arr: ShapeBucket[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * DAY_MS);
      const k = dateKey(d);
      arr.push({ key: k, label: String(d.getDate()), sec: 0, highlight: k === todayKey });
    }
    const byKey = new Map(arr.map((b) => [b.key, b]));
    for (const s of sessions) {
      if (!s.duration_seconds || !s.ended_at) continue;
      const k = dateKey(new Date(s.started_at));
      const b = byKey.get(k);
      if (b) b.sec += s.duration_seconds;
    }
    const axis = arr.map((b, i) => {
      if (i === 0 || i === arr.length - 1 || i === Math.floor(arr.length / 2)) return b.label;
      return null;
    });
    return { buckets: arr, axisLabels: axis };
  }

  // all → last 12 weeks, weekly buckets
  const weeks = 12;
  const arr: ShapeBucket[] = [];
  const nowDay = startOfDay(now);
  // Walk back so the most recent (including today) is the last bucket.
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(nowDay.getTime() - (i * 7) * DAY_MS);
    const weekStart = new Date(weekEnd.getTime() - 6 * DAY_MS);
    arr.push({
      key: dateKey(weekStart),
      label: `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()}`,
      sec: 0,
      highlight: i === 0,
    });
  }
  for (const s of sessions) {
    if (!s.duration_seconds || !s.ended_at) continue;
    const sd = startOfDay(new Date(s.started_at));
    // Find the bucket whose [start, start+7) contains sd.
    for (const b of arr) {
      const bs = new Date(b.key).getTime();
      if (sd.getTime() >= bs && sd.getTime() < bs + 7 * DAY_MS) {
        b.sec += s.duration_seconds;
        break;
      }
    }
  }
  const axis = arr.map((b, i) => (i === 0 || i === arr.length - 1 ? b.label : null));
  return { buckets: arr, axisLabels: axis };
}

// ═══════════════════════════════════════════════════════════════════════════
//   Screen
// ═══════════════════════════════════════════════════════════════════════════

export function InsightsView() {
  const theme = useTheme();
  const C = theme.dark ? DARK : LIGHT;

  const userId = useStore((s) => s.userId);
  const profileV2 = useStore((s) => s.profileV2);
  const streak = profileV2?.current_streak ?? 0;

  const [range, setRange] = useState<InsightsRange>('week');
  const [payload, setPayload] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [activeProject, setActiveProject] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchInsights(range)
      .then((p) => {
        if (cancelled) return;
        setPayload(p);
        setActiveProject((prev) => {
          if (prev && p.projects.some((proj) => proj.id === prev)) return prev;
          return p.projects[0]?.id ?? null;
        });
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, userId, nonce]);

  const missingSchema = payload?.missing_label_schema === true;

  return (
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 140, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      <RangeToggle value={range} onChange={setRange} C={C} />

      {payload ? (
        <Text style={{ fontFamily: FONT.m, fontSize: 12, color: C.ink3 }}>
          {rangeSubtitle(payload)} ·{' '}
          <Text style={{ color: C.ink2, fontFamily: FONT.sb }}>
            based on {payload.summary.task_count} tracked task
            {payload.summary.task_count === 1 ? '' : 's'}
          </Text>
        </Text>
      ) : null}

      {loading && !payload ? <SkeletonCards C={C} /> : null}

      {error && !loading ? (
        <ErrorCard C={C} message={error} onRetry={() => setNonce((n) => n + 1)} />
      ) : null}

      {payload ? (
        <>
          <KpiGrid C={C} payload={payload} streak={streak} />

          <DayShapeCard C={C} range={range} payload={payload} userId={userId} />

          {!missingSchema && payload.categories.length > 0 && (
            <BarListCard
              C={C}
              title="Time by category"
              subtitle="What kind of work am I doing?"
              items={payload.categories}
              totalSeconds={payload.summary.total_seconds}
            />
          )}

          {!missingSchema && payload.projects.length > 0 && (
            <BarListCard
              C={C}
              title="Time by project"
              subtitle="What thing am I building?"
              items={payload.projects}
              totalSeconds={payload.summary.total_seconds}
            />
          )}

          {!missingSchema && payload.projects.length > 0 && (
            <DrillDownCard
              C={C}
              payload={payload}
              activeProject={activeProject}
              setActiveProject={setActiveProject}
            />
          )}

          {payload.tags.length > 0 && <TagsCard C={C} tags={payload.tags} />}

          {range === 'today' && userId ? <OffPlanCard C={C} userId={userId} /> : null}

          {missingSchema && <MissingSchemaHint C={C} />}
        </>
      ) : null}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//   Subcomponents
// ═══════════════════════════════════════════════════════════════════════════

function Card({ C, children, style }: { C: Palette; children: React.ReactNode; style?: object }) {
  return (
    <View
      style={[
        {
          backgroundColor: C.card,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 14,
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function CardHead({
  C,
  title,
  subtitle,
  meta,
}: {
  C: Palette;
  title: string;
  subtitle?: string;
  meta?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONT.b, fontSize: 14, color: C.ink }}>{title}</Text>
        {subtitle ? (
          <Text style={{ fontFamily: FONT.m, fontSize: 11, color: C.ink3, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text style={{ fontFamily: FONT.m, fontSize: 11, color: C.ink3 }}>{meta}</Text>
      ) : null}
    </View>
  );
}

// ── Range toggle ───────────────────────────────────────────────────────────
function RangeToggle({
  value,
  onChange,
  C,
}: {
  value: InsightsRange;
  onChange: (r: InsightsRange) => void;
  C: Palette;
}) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 11,
        padding: 3,
        gap: 2,
      }}
    >
      {RANGES.map((r) => {
        const on = r.key === value;
        return (
          <Pressable
            key={r.key}
            onPress={() => onChange(r.key)}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 14,
              borderRadius: 8,
              backgroundColor: on ? C.purple : 'transparent',
            }}
          >
            <Text
              style={{
                fontFamily: FONT.sb,
                fontSize: 12,
                color: on ? '#FFFFFF' : C.ink2,
              }}
            >
              {r.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── KPI grid ───────────────────────────────────────────────────────────────
function KpiGrid({
  C,
  payload,
  streak,
}: {
  C: Palette;
  payload: InsightsPayload;
  streak: number;
}) {
  const { summary } = payload;
  const delta = summary.total_seconds - summary.total_seconds_prev;
  const totalMeta =
    summary.total_seconds_prev > 0
      ? `${delta >= 0 ? '+' : ''}${fmtDuration(Math.abs(delta))} from last ${payload.range === 'today' ? 'day' : payload.range}`
      : '';
  const topCatName = summary.top_category?.name ?? '—';
  const topCatMeta = summary.top_category
    ? `${fmtDuration(summary.top_category.total_seconds)} · ${summary.top_category_pct}%`
    : '';

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1, gap: 10 }}>
        <Kpi
          C={C}
          label="Total tracked"
          value={fmtDuration(summary.total_seconds)}
          meta={totalMeta}
          metaGreen={delta > 0}
        />
        <Kpi
          C={C}
          label="Tasks done"
          value={String(summary.task_count)}
          meta={summary.task_count > 0 ? 'tracked tasks' : ''}
        />
      </View>
      <View style={{ flex: 1, gap: 10 }}>
        <Kpi
          C={C}
          label="Top category"
          value={topCatName}
          valueColor={summary.top_category?.color ?? C.orange}
          meta={topCatMeta}
          small
        />
        <Kpi
          C={C}
          label="Streak"
          value={String(streak)}
          valueSuffix={`day${streak === 1 ? '' : 's'}`}
          meta=""
        />
      </View>
    </View>
  );
}

function Kpi({
  C,
  label,
  value,
  valueColor,
  valueSuffix,
  meta,
  metaGreen,
  small,
}: {
  C: Palette;
  label: string;
  value: string;
  valueColor?: string;
  valueSuffix?: string;
  meta: string;
  metaGreen?: boolean;
  small?: boolean;
}) {
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
      <Text
        style={{
          fontFamily: FONT.b,
          fontSize: 10,
          letterSpacing: 0.9,
          color: C.ink3,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: FONT.xb,
            fontSize: small ? 18 : 22,
            letterSpacing: -0.5,
            color: valueColor ?? C.ink,
            lineHeight: small ? 22 : 26,
          }}
        >
          {value}
        </Text>
        {valueSuffix ? (
          <Text style={{ fontFamily: FONT.sb, fontSize: 13, color: C.ink3 }}>{valueSuffix}</Text>
        ) : null}
      </View>
      {meta ? (
        <Text
          style={{
            fontFamily: FONT.m,
            fontSize: 11,
            color: metaGreen ? C.green : C.ink3,
            marginTop: 4,
          }}
        >
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

// ── Day shape ──────────────────────────────────────────────────────────────
const SHAPE_W = 320;
const SHAPE_H = 130;

function DayShapeCard({
  C,
  range,
  payload,
  userId,
}: {
  C: Palette;
  range: InsightsRange;
  payload: InsightsPayload;
  userId: string | null;
}) {
  const [sessions, setSessions] = useState<TrackedSession[]>([]);
  const rangeStart = payload.range_start ? new Date(payload.range_start) : null;
  const rangeEnd = new Date(payload.range_end);

  // Window for the chart. 'all' range: last 12 weeks. Otherwise use the payload range.
  const queryStart = useMemo(() => {
    if (range === 'all') return startOfDay(new Date(rangeEnd.getTime() - 12 * 7 * DAY_MS));
    return rangeStart ?? startOfDay(new Date(rangeEnd.getTime() - 6 * DAY_MS));
  }, [range, rangeStart?.getTime(), rangeEnd.getTime()]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('tracked_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', queryStart.toISOString())
        .lte('started_at', rangeEnd.toISOString())
        .not('ended_at', 'is', null);
      if (!cancelled) setSessions((data ?? []) as TrackedSession[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, queryStart.getTime(), rangeEnd.getTime()]);

  const { buckets, axisLabels } = useMemo(
    () => bucketForRange(range, sessions, queryStart, rangeEnd),
    [range, sessions, queryStart.getTime(), rangeEnd.getTime()],
  );
  const maxSec = Math.max(1, ...buckets.map((b) => b.sec));
  const n = buckets.length;
  const gap = Math.max(3, Math.min(6, (SHAPE_W * 0.06) / n));
  const barW = Math.max(2, (SHAPE_W - gap * (n - 1)) / n);

  const subtitle =
    range === 'today'
      ? 'Tracked hours per hour of day'
      : range === 'all'
      ? 'Tracked hours per week'
      : 'Tracked hours per day';

  const meta =
    range === 'today'
      ? '24 hours'
      : range === 'week'
      ? 'Last 7 days'
      : range === 'month'
      ? `${n} days`
      : '12 weeks';

  return (
    <Card C={C}>
      <CardHead C={C} title="Day shape" subtitle={subtitle} meta={meta} />
      <Svg width="100%" height={SHAPE_H} viewBox={`0 0 ${SHAPE_W} ${SHAPE_H}`} preserveAspectRatio="none">
        {buckets.map((b, i) => {
          const h = Math.max(2, (b.sec / maxSec) * (SHAPE_H - 4));
          const x = i * (barW + gap);
          return (
            <Rect
              key={b.key}
              x={x}
              y={SHAPE_H - h}
              width={barW}
              height={h}
              rx={2}
              fill={b.highlight ? C.purple : C.purpleDim}
            />
          );
        })}
      </Svg>
      <View
        style={{
          flexDirection: 'row',
          marginTop: 6,
          borderTopWidth: 1,
          borderTopColor: C.borderSoft,
          paddingTop: 6,
        }}
      >
        {axisLabels.map((lbl, i) => (
          <Text
            key={`ax-${i}`}
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: FONT.m,
              fontSize: 10,
              color: C.ink3,
            }}
          >
            {lbl ?? ''}
          </Text>
        ))}
      </View>
    </Card>
  );
}

// ── Bar list (category / project) ──────────────────────────────────────────
function BarListCard({
  C,
  title,
  subtitle,
  items,
  totalSeconds,
}: {
  C: Palette;
  title: string;
  subtitle?: string;
  items: (InsightsBucket | InsightsProjectBucket)[];
  totalSeconds: number;
}) {
  const maxSec = Math.max(1, ...items.map((i) => i.total_seconds));
  const rows = items.slice(0, 8);
  return (
    <Card C={C}>
      <CardHead C={C} title={title} subtitle={subtitle} />
      {rows.map((b, i) => {
        const pct = totalSeconds > 0 ? Math.round((b.total_seconds / totalSeconds) * 100) : 0;
        const fillWidth = (b.total_seconds / maxSec) * 100;
        return (
          <View
            key={b.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 9,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: C.borderSoft,
            }}
          >
            <View style={{ flex: 1.1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: b.color || C.purple }}
              />
              <Text
                numberOfLines={1}
                style={{ fontFamily: FONT.sb, fontSize: 13, color: C.ink, flex: 1 }}
              >
                {b.name}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                height: 18,
                backgroundColor: C.chipBg,
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${Math.max(2, fillWidth)}%`,
                  height: '100%',
                  backgroundColor: b.color || C.purple,
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  paddingRight: 6,
                }}
              >
                {fillWidth > 30 ? (
                  <Text style={{ fontFamily: FONT.b, fontSize: 10, color: '#FFFFFF' }}>
                    {pct}%
                  </Text>
                ) : null}
              </View>
            </View>
            <Text
              style={{
                fontFamily: FONT.sb,
                fontSize: 11,
                color: C.ink2,
                minWidth: 48,
                textAlign: 'right',
              }}
            >
              {fmtDuration(b.total_seconds)}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

// ── Drill-down ─────────────────────────────────────────────────────────────
function DrillDownCard({
  C,
  payload,
  activeProject,
  setActiveProject,
}: {
  C: Palette;
  payload: InsightsPayload;
  activeProject: string | null;
  setActiveProject: (id: string) => void;
}) {
  const project = payload.projects.find((p) => p.id === activeProject) ?? null;
  const catsInProject = project ? payload.categories_by_project[project.id] ?? [] : [];
  const tasks = project ? payload.tasks_by_project[project.id] ?? [] : [];
  const catMax = Math.max(1, ...catsInProject.map((c) => c.total_seconds));

  return (
    <Card C={C}>
      <CardHead C={C} title="Drill down" subtitle="Time on one project, by category" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingBottom: 4 }}
        style={{ marginBottom: 10 }}
      >
        {payload.projects.map((p) => {
          const on = p.id === activeProject;
          return (
            <Pressable
              key={p.id}
              onPress={() => setActiveProject(p.id)}
              style={{
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 7,
                borderWidth: 1.5,
                borderColor: on ? p.color || C.purpleStrong : 'transparent',
                backgroundColor: on ? C.purpleSoft : C.chipBg,
                opacity: on ? 1 : 0.7,
              }}
            >
              <Text
                style={{
                  fontFamily: FONT.b,
                  fontSize: 11,
                  color: on ? C.purpleStrong : C.ink2,
                }}
              >
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {project ? (
        <View
          style={{
            backgroundColor: C.purpleTint,
            borderRadius: 10,
            paddingHorizontal: 13,
            paddingVertical: 11,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <Text style={{ fontFamily: FONT.m, fontSize: 12, color: C.ink2 }}>
            Time on{' '}
            <Text style={{ fontFamily: FONT.b, color: C.ink }}>{project.name}</Text>
          </Text>
          <Text
            style={{
              fontFamily: FONT.xb,
              fontSize: 18,
              letterSpacing: -0.5,
              color: C.purpleStrong,
            }}
          >
            {fmtDuration(project.total_seconds)}
          </Text>
        </View>
      ) : null}

      {catsInProject.map((c, i) => {
        const fillPct = (c.total_seconds / catMax) * 100;
        const pct =
          project && project.total_seconds > 0
            ? Math.round((c.total_seconds / project.total_seconds) * 100)
            : 0;
        return (
          <View
            key={c.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 9,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: C.borderSoft,
            }}
          >
            <View style={{ flex: 1.1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color || C.orange }}
              />
              <Text
                numberOfLines={1}
                style={{ fontFamily: FONT.sb, fontSize: 13, color: C.ink, flex: 1 }}
              >
                {c.name}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                height: 18,
                backgroundColor: C.chipBg,
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${Math.max(2, fillPct)}%`,
                  height: '100%',
                  backgroundColor: c.color || C.orange,
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  paddingRight: 6,
                }}
              >
                {fillPct > 30 ? (
                  <Text style={{ fontFamily: FONT.b, fontSize: 10, color: '#FFFFFF' }}>{pct}%</Text>
                ) : null}
              </View>
            </View>
            <Text
              style={{
                fontFamily: FONT.sb,
                fontSize: 11,
                color: C.ink2,
                minWidth: 48,
                textAlign: 'right',
              }}
            >
              {fmtDuration(c.total_seconds)}
            </Text>
          </View>
        );
      })}

      {tasks.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 8,
              paddingHorizontal: 4,
              borderBottomWidth: 1,
              borderBottomColor: C.borderSoft,
            }}
          >
            <Text
              style={{
                fontFamily: FONT.b,
                fontSize: 10,
                letterSpacing: 0.7,
                color: C.ink3,
                textTransform: 'uppercase',
              }}
            >
              Task
            </Text>
            <Text
              style={{
                fontFamily: FONT.b,
                fontSize: 10,
                letterSpacing: 0.7,
                color: C.ink3,
                textTransform: 'uppercase',
              }}
            >
              Time
            </Text>
          </View>
          {tasks.map((t, i) => (
            <TaskRow key={t.id} C={C} task={t} last={i === tasks.length - 1} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function TaskRow({ C, task, last }: { C: Palette; task: InsightsTask; last: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingVertical: 10,
        paddingHorizontal: 4,
        gap: 8,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.borderSoft,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontFamily: FONT.m, fontSize: 12, color: C.ink, lineHeight: 16 }}>
          {task.title}
        </Text>
        <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
          {task.categories.slice(0, 2).map((c) => (
            <View
              key={c.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 2,
                paddingHorizontal: 7,
                borderRadius: 5,
                backgroundColor: addAlpha(c.color, 0.16),
              }}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: c.color,
                }}
              />
              <Text style={{ fontFamily: FONT.b, fontSize: 9, color: c.color }}>{c.name}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text
        style={{
          fontFamily: FONT.b,
          fontSize: 11,
          color: C.ink2,
          minWidth: 56,
          textAlign: 'right',
        }}
      >
        {fmtDuration(task.total_seconds)}
      </Text>
    </View>
  );
}

function addAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `#${h}${a}`;
}

// ── Tags ───────────────────────────────────────────────────────────────────
function TagsCard({ C, tags }: { C: Palette; tags: InsightsTagBucket[] }) {
  const maxSec = Math.max(1, ...tags.map((t) => t.total_seconds));
  return (
    <Card C={C}>
      <CardHead C={C} title="Tags" subtitle="Free-form tags by time · swipe →" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 8 }}
      >
        {tags.map((t) => {
          // Scale chip font 12–16 by rank in time.
          const ratio = t.total_seconds / maxSec;
          const fontSize = 12 + Math.round(ratio * 4);
          return (
            <View
              key={t.id}
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: 6,
                paddingVertical: 6,
                paddingHorizontal: 12,
                backgroundColor: C.chipBg,
                borderRadius: 10,
              }}
            >
              <Text style={{ fontFamily: FONT.sb, fontSize, color: C.ink2 }}>
                <Text style={{ opacity: 0.5 }}>#</Text>
                {t.name}
              </Text>
              <Text style={{ fontFamily: FONT.m, fontSize: 10, color: C.ink3 }}>
                {fmtDuration(t.total_seconds)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <View
        style={{
          backgroundColor: C.chipBg,
          borderRadius: 10,
          padding: 10,
          marginTop: 12,
        }}
      >
        <Text style={{ fontFamily: FONT.m, fontSize: 11, color: C.ink3, lineHeight: 16 }}>
          <Text style={{ fontFamily: FONT.b, color: C.ink2 }}>Why tags? </Text>
          Categories tell the kind of work, projects the for-what. Tags catch cross-cutting
          signals — #deep-work, #blocked — across everything.
        </Text>
      </View>
    </Card>
  );
}

// ── Off Plan (today only) ──────────────────────────────────────────────────
function OffPlanCard({ C, userId }: { C: Palette; userId: string }) {
  const tasks = useStore((s) => s.tasks);
  const [offPlan, setOffPlan] = useState<TrackedSession[]>([]);

  useEffect(() => {
    let cancelled = false;
    const dayStart = startOfDay(new Date());
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    void (async () => {
      const { data } = await supabase
        .from('tracked_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', dayStart.toISOString())
        .lt('started_at', dayEnd.toISOString())
        .is('planned_block_id', null)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: true });
      if (!cancelled) setOffPlan((data ?? []) as TrackedSession[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (offPlan.length === 0) return null;

  const total = offPlan.reduce((s, x) => s + (x.duration_seconds ?? 0), 0);

  return (
    <Card C={C}>
      <CardHead
        C={C}
        title={`Off plan · ${fmtDuration(total)} · ${offPlan.length} ${offPlan.length === 1 ? 'entry' : 'entries'}`}
        subtitle="Tasks tracked but not on your daily plan"
      />
      {offPlan.map((s, i) => {
        const task = tasks.find((t) => t.id === s.task_id);
        const title = task?.title ?? 'Deleted task';
        return (
          <View
            key={s.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 11,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: C.borderSoft,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.red }} />
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontFamily: FONT.m, fontSize: 13, color: C.ink }}
            >
              {title}
            </Text>
            <Text style={{ fontFamily: FONT.m, fontSize: 11, color: C.ink3 }}>
              {fmtHHMM(s.started_at)}
            </Text>
            <Text
              style={{
                fontFamily: FONT.b,
                fontSize: 12,
                color: C.red,
                minWidth: 48,
                textAlign: 'right',
              }}
            >
              {fmtDuration(s.duration_seconds ?? 0)}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

// ── Missing schema hint ────────────────────────────────────────────────────
function MissingSchemaHint({ C }: { C: Palette }) {
  return (
    <Card C={C}>
      <Text style={{ fontFamily: FONT.b, fontSize: 13, color: C.ink, marginBottom: 4 }}>
        Categories and projects not set up
      </Text>
      <Text style={{ fontFamily: FONT.m, fontSize: 12, color: C.ink3, lineHeight: 17 }}>
        Set up categories and projects in Settings to unlock the breakdowns above.
      </Text>
    </Card>
  );
}

// ── Skeleton + error ───────────────────────────────────────────────────────
function SkeletonCards({ C }: { C: Palette }) {
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[0, 1].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 92,
              backgroundColor: C.borderSoft,
              borderRadius: 14,
            }}
          />
        ))}
      </View>
      <View style={{ height: 190, backgroundColor: C.borderSoft, borderRadius: 14 }} />
      <View style={{ height: 160, backgroundColor: C.borderSoft, borderRadius: 14 }} />
      <View
        style={{
          height: 20,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 8,
        }}
      >
        <ActivityIndicator color={C.purple} size="small" />
      </View>
    </View>
  );
}

function ErrorCard({
  C,
  message,
  onRetry,
}: {
  C: Palette;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card C={C}>
      <Text style={{ fontFamily: FONT.b, fontSize: 13, color: C.ink, marginBottom: 6 }}>
        Couldn't load insights
      </Text>
      <Text
        style={{ fontFamily: FONT.m, fontSize: 12, color: C.ink3, lineHeight: 17, marginBottom: 12 }}
      >
        {message}
      </Text>
      <Pressable
        onPress={onRetry}
        style={{
          alignSelf: 'flex-start',
          backgroundColor: C.purple,
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 8,
        }}
      >
        <Text style={{ fontFamily: FONT.sb, fontSize: 12, color: '#FFFFFF' }}>Retry</Text>
      </Pressable>
    </Card>
  );
}
