import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { fmtShort } from '@/lib/utils';
import { DailySummaryCard } from './DailySummaryCard';
import type { TrackedSession } from '@/types';

const DAY_MS = 24 * 3600 * 1000;

interface RowSummary {
  blockId: string;
  taskTitle: string;
  plannedSeconds: number;
  actualSeconds: number;
  status: 'tracking' | 'on_time' | 'over' | 'under' | 'skipped';
}

export function TimelineView() {
  const userId = useStore((s) => s.userId);
  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const activeSession = useStore((s) => s.activeSession);

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

  const rows: RowSummary[] = useMemo(() => {
    return plannedBlocks.map((pb) => {
      const taskTitle = tasks.find((t) => t.id === pb.task_id)?.title ?? 'Untitled';
      const matched = sessions.filter((s) => s.planned_block_id === pb.id);
      const actual = matched.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
      let status: RowSummary['status'] = 'skipped';
      if (
        activeSession?.planned_block_id === pb.id ||
        matched.some((s) => !s.ended_at)
      ) {
        status = 'tracking';
      } else if (actual === 0) {
        status = 'skipped';
      } else if (
        actual >= pb.duration_seconds * 0.9 &&
        actual <= pb.duration_seconds * 1.1
      ) {
        status = 'on_time';
      } else if (actual > pb.duration_seconds * 1.1) {
        status = 'over';
      } else {
        status = 'under';
      }
      return {
        blockId: pb.id,
        taskTitle,
        plannedSeconds: pb.duration_seconds,
        actualSeconds: actual,
        status,
      };
    });
  }, [plannedBlocks, sessions, tasks, activeSession]);

  const unplanned = sessions.filter((s) => !s.planned_block_id && s.ended_at);
  const totalPlanned = rows.reduce((s, r) => s + r.plannedSeconds, 0);
  const totalActual = rows.reduce((s, r) => s + r.actualSeconds, 0);
  const saved = rows.reduce(
    (s, r) => s + Math.max(0, r.plannedSeconds - r.actualSeconds),
    0,
  );
  const drifted =
    rows.reduce(
      (s, r) => s + Math.max(0, r.actualSeconds - r.plannedSeconds),
      0,
    ) +
    unplanned.reduce((s, u) => s + (u.duration_seconds ?? 0), 0);
  const onPlanPct =
    totalPlanned > 0
      ? Math.min(100, Math.round((totalActual / totalPlanned) * 100))
      : 0;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }}
    >
      <DailySummaryCard />

      {/* Score tiles */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <ScoreTile
          label="On plan"
          value={`${onPlanPct}%`}
          color={onPlanPct >= 80 ? '#10b981' : onPlanPct >= 50 ? '#f59e0b' : '#dc2626'}
        />
        <ScoreTile label="Saved" value={fmtShort(saved)} color="#10b981" />
        <ScoreTile label="Drifted" value={fmtShort(drifted)} color="#dc2626" />
      </View>

      {rows.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 30 }}>
          <Text style={{ color: '#aaa', fontSize: 13, textAlign: 'center' }}>
            No data for this day. Start tracking to see your plan vs reality.
          </Text>
        </View>
      )}

      {rows.map((r) => (
        <TimelineRow key={r.blockId} row={r} />
      ))}

      {unplanned.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            Off plan ·{' '}
            {fmtShort(
              unplanned.reduce((s, u) => s + (u.duration_seconds ?? 0), 0),
            )}{' '}
            total
          </Text>
          {unplanned.map((s) => {
            const task = tasks.find((t) => t.id === s.task_id);
            return (
              <View
                key={s.id}
                style={{
                  backgroundColor: '#fff',
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 6,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 13, color: '#1a1a2e' }}>
                  {task?.title ?? 'Deleted task'}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#f59e0b' }}>
                  {fmtShort(s.duration_seconds ?? 0)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function ScoreTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 12,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: '800',
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 20, fontWeight: '800', color, marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
}

function TimelineRow({ row }: { row: RowSummary }) {
  const maxSeconds = Math.max(row.plannedSeconds, row.actualSeconds, 1);
  const plannedPct = (row.plannedSeconds / maxSeconds) * 100;
  const actualPct = (row.actualSeconds / maxSeconds) * 100;

  const BADGE: Record<
    RowSummary['status'],
    { label: string; color: string; bg: string }
  > = {
    on_time: { label: '✓ On time', color: '#10b981', bg: '#d1fae5' },
    over: {
      label: `+${fmtShort(row.actualSeconds - row.plannedSeconds)}`,
      color: '#dc2626',
      bg: '#fee2e2',
    },
    under: {
      label: `−${fmtShort(row.plannedSeconds - row.actualSeconds)}`,
      color: '#10b981',
      bg: '#d1fae5',
    },
    tracking: { label: '● Tracking', color: '#8b5cf6', bg: '#ede9fe' },
    skipped: { label: 'Skipped', color: '#dc2626', bg: '#fee2e2' },
  };
  const b = BADGE[row.status];

  return (
    <View
      style={{
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 12,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: row.status === 'skipped' ? '#888' : '#1a1a2e',
            textDecorationLine: row.status === 'skipped' ? 'line-through' : 'none',
            flex: 1,
          }}
          numberOfLines={1}
        >
          {row.taskTitle}
        </Text>
        <View
          style={{
            backgroundColor: b.bg,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: b.color }}>
            {b.label}
          </Text>
        </View>
      </View>
      <View style={{ height: 18, position: 'relative' }}>
        <View
          style={{
            position: 'absolute',
            top: 7,
            height: 3,
            width: `${plannedPct}%`,
            backgroundColor: 'rgba(139,92,246,0.35)',
            borderRadius: 2,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 4,
            height: 9,
            width: `${actualPct}%`,
            backgroundColor: '#8b5cf6',
            borderRadius: 4,
          }}
        />
      </View>
      <Text style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
        Planned {fmtShort(row.plannedSeconds)} · Actual {fmtShort(row.actualSeconds)}
      </Text>
    </View>
  );
}
