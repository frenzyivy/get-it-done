import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { type as M3Type } from '@/lib/theme';
import { DailySummaryCard } from './DailySummaryCard';
import type { TrackedSession } from '@/types';

const DAY_MS = 24 * 3600 * 1000;
const START_HOUR = 6;
const END_HOUR = 22;
const SHAPE_W = 320;
const SHAPE_H = 70;
const HOUR_SPAN = END_HOUR - START_HOUR;

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

// Colored dot hue via HSL — cheap substitute for oklch(0.6 0.14 hue) from spec.
function hueColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h}, 60%, 55%)`;
}

export function TimelineView() {
  const theme = useTheme();
  const c = theme.colors;
  const success = theme.dark ? '#6FE39B' : '#0F7A4B';

  const userId = useStore((s) => s.userId);
  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);

  const dayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const dayEnd = useMemo(() => new Date(dayStart.getTime() + DAY_MS), [dayStart]);

  useEffect(() => {
    if (!userId) return;
    void fetchPlannedBlocks(dayStart.toISOString(), dayEnd.toISOString());
  }, [userId, fetchPlannedBlocks, dayStart, dayEnd]);

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

  const totalPlanned = plannedBlocks.reduce((s, b) => s + b.duration_seconds, 0);
  const totalTracked = sessions.reduce(
    (s, x) => s + (x.duration_seconds ?? 0),
    0,
  );

  const onPlanSec = sessions
    .filter((s) => s.planned_block_id)
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const driftedSec = sessions
    .filter((s) => !s.planned_block_id && s.ended_at)
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const savedSec = Math.max(0, totalPlanned - totalTracked);
  const onPlanPct =
    totalPlanned > 0 ? Math.round((onPlanSec / totalPlanned) * 100) : 0;

  const offPlan = sessions.filter((s) => !s.planned_block_id && s.ended_at);
  const offPlanCount = offPlan.length;

  const hourToX = (h: number) =>
    Math.max(0, Math.min(SHAPE_W, ((h - START_HOUR) / HOUR_SPAN) * SHAPE_W));

  // Planned envelope — a dashed outline path connecting each block's top.
  const envelopePath = useMemo(() => {
    if (plannedBlocks.length === 0) return '';
    const sorted = [...plannedBlocks].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );
    let d = '';
    for (const b of sorted) {
      const startH = new Date(b.start_at).getHours() + new Date(b.start_at).getMinutes() / 60;
      const endH = startH + b.duration_seconds / 3600;
      const x1 = hourToX(startH);
      const x2 = hourToX(endH);
      const top = SHAPE_H * 0.3;
      d += `M ${x1} ${SHAPE_H - 2} L ${x1} ${top} L ${x2} ${top} L ${x2} ${SHAPE_H - 2} `;
    }
    return d.trim();
  }, [plannedBlocks]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 16 }}>
      <DailySummaryCard />

      {/* 1 — Stat row card */}
      <View
        style={{
          backgroundColor: c.elevation.level1,
          borderRadius: 16,
          padding: 16,
          flexDirection: 'row',
          borderWidth: 1,
          borderColor: c.outlineVariant,
        }}
      >
        <Stat
          label="On plan"
          value={`${onPlanPct}%`}
          color={c.onSurface}
          labelColor={c.onSurfaceVariant}
        />
        <Divider color={c.outlineVariant} />
        <Stat
          label="Saved"
          value={savedSec > 0 ? fmtShortMono(savedSec) : '—'}
          color={savedSec > 0 ? c.onSurface : c.onSurfaceVariant}
          labelColor={c.onSurfaceVariant}
        />
        <Divider color={c.outlineVariant} />
        <Stat
          label="Drifted"
          value={driftedSec > 0 ? fmtShortMono(driftedSec) : '—'}
          color={driftedSec > 0 ? c.tertiary : c.onSurfaceVariant}
          labelColor={c.onSurfaceVariant}
        />
      </View>

      {/* 2 — Day shape card */}
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
            {String(START_HOUR).padStart(2, '0')} — {String(END_HOUR).padStart(2, '0')}
          </Text>
        </View>
        <Svg
          width="100%"
          height={SHAPE_H}
          viewBox={`0 0 ${SHAPE_W} ${SHAPE_H}`}
          preserveAspectRatio="none"
        >
          {/* Hour gridlines */}
          {Array.from({ length: HOUR_SPAN + 1 }).map((_, i) => (
            <Line
              key={i}
              x1={(i / HOUR_SPAN) * SHAPE_W}
              x2={(i / HOUR_SPAN) * SHAPE_W}
              y1={0}
              y2={SHAPE_H}
              stroke={c.outlineVariant}
              strokeWidth={1}
            />
          ))}
          {/* Dashed planned envelope */}
          {envelopePath !== '' && (
            <Path
              d={envelopePath}
              fill="none"
              stroke={c.outline}
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
          )}
          {/* Actual bars — primary 70% opacity */}
          {sessions.map((s) => {
            if (!s.duration_seconds || !s.ended_at) return null;
            const startDate = new Date(s.started_at);
            const startH =
              startDate.getHours() + startDate.getMinutes() / 60;
            const endH = startH + s.duration_seconds / 3600;
            const x = hourToX(startH);
            const w = Math.max(2, hourToX(endH) - x);
            const h = Math.min(SHAPE_H - 6, 10 + (s.duration_seconds / 1800) * 8);
            return (
              <Rect
                key={s.id}
                x={x}
                y={SHAPE_H - h - 2}
                width={w}
                height={h}
                rx={2}
                fill={c.primary}
                opacity={0.7}
              />
            );
          })}
        </Svg>
      </View>

      {/* 3 — Off-plan list */}
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
                          color: c.tertiary,
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

      {/* Success hint when perfectly on plan and nothing drifted */}
      {offPlanCount === 0 && sessions.length > 0 && (
        <View
          style={{
            backgroundColor: c.elevation.level1,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: c.outlineVariant,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              ...M3Type.labelMedium,
              color: c.onSurfaceVariant,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Off plan
          </Text>
          <Text style={{ ...M3Type.bodyMedium, color: success }}>
            Nothing drifted today.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  color,
  labelColor,
}: {
  label: string;
  value: string;
  color: string;
  labelColor?: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text
        style={{
          fontSize: 12,
          lineHeight: 16,
          fontWeight: '500',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: labelColor,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 28,
          lineHeight: 36,
          fontWeight: '400',
          color,
          fontVariant: ['tabular-nums'],
          marginTop: 4,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={{ width: 1, backgroundColor: color, marginHorizontal: 12 }} />;
}
