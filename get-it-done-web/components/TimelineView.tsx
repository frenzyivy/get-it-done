'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { fmtShort } from '@/lib/utils';
import { DailySummaryCard } from './DailySummaryCard';
import { TimelineGantt } from './TimelineGantt';
import type { TrackedSession } from '@/types';

// v2 spec §9 — the "honest mirror".
// Reads planned_blocks and tracked_sessions for today and shows:
//  1. Honest score card (on-plan %, saved, drifted)
//  2. Per-task planned-vs-actual bar comparison
//  3. Unplanned sessions grouped at the bottom
//  4. CSV export

const DAY_MS = 24 * 3600 * 1000;

interface RowSummary {
  blockId: string;
  taskId: string | null;
  taskTitle: string;
  plannedSeconds: number;
  actualSeconds: number;
  startAt: Date;
  status: 'tracking' | 'on_time' | 'over' | 'under' | 'skipped';
}

export function TimelineView() {
  const userId = useStore((s) => s.userId);
  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const activeSessions = useStore((s) => s.activeSessions);

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
      const { data } = await supabase()
        .from('tracked_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', dayStart.toISOString())
        .lt('started_at', dayEnd.toISOString())
        .order('started_at', { ascending: true });
      setSessions((data ?? []) as TrackedSession[]);
    })();
  }, [userId, dayStart, dayEnd]);

  // Sampled in state and ticked once a minute so the "tracking" status check
  // stays current without calling Date.now() during render (React Compiler).
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const rows: RowSummary[] = useMemo(() => {
    return plannedBlocks.map((pb) => {
      const taskTitle = tasks.find((t) => t.id === pb.task_id)?.title ?? 'Untitled';
      const matched = sessions.filter((s) => s.planned_block_id === pb.id);
      const actual = matched.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);

      let status: RowSummary['status'] = 'skipped';
      const blockStart = new Date(pb.start_at).getTime();
      const blockEnd = blockStart + pb.duration_seconds * 1000;
      if (
        activeSessions.some((s) => s.planned_block_id === pb.id) ||
        (nowMs >= blockStart &&
          nowMs < blockEnd &&
          matched.some((s) => !s.ended_at))
      ) {
        status = 'tracking';
      } else if (actual === 0) {
        status = 'skipped';
      } else if (actual >= pb.duration_seconds * 0.9 && actual <= pb.duration_seconds * 1.1) {
        status = 'on_time';
      } else if (actual > pb.duration_seconds * 1.1) {
        status = 'over';
      } else {
        status = 'under';
      }

      return {
        blockId: pb.id,
        taskId: pb.task_id,
        taskTitle,
        plannedSeconds: pb.duration_seconds,
        actualSeconds: actual,
        startAt: new Date(pb.start_at),
        status,
      };
    });
  }, [plannedBlocks, sessions, tasks, activeSessions, nowMs]);

  const unplanned = useMemo(
    () => sessions.filter((s) => !s.planned_block_id && s.ended_at),
    [sessions],
  );

  const totalPlanned = rows.reduce((s, r) => s + r.plannedSeconds, 0);
  const totalActual = rows.reduce((s, r) => s + r.actualSeconds, 0);
  const saved = rows.reduce(
    (s, r) => s + Math.max(0, r.plannedSeconds - r.actualSeconds),
    0,
  );
  const drifted =
    rows.reduce((s, r) => s + Math.max(0, r.actualSeconds - r.plannedSeconds), 0) +
    unplanned.reduce((s, u) => s + (u.duration_seconds ?? 0), 0);
  const onPlanPct =
    totalPlanned > 0 ? Math.min(100, Math.round((totalActual / totalPlanned) * 100)) : 0;

  const exportCsv = () => {
    const header = 'block_id,task_title,planned_start,planned_seconds,actual_seconds,status';
    const body = rows
      .map((r) =>
        [
          r.blockId,
          `"${r.taskTitle.replace(/"/g, '""')}"`,
          r.startAt.toISOString(),
          r.plannedSeconds,
          r.actualSeconds,
          r.status,
        ].join(','),
      )
      .join('\n');
    const csv = `${header}\n${body}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planned_vs_actual_${dayStart.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Highlight a session block on the Gantt when its row in the off-plan list is
  // clicked. Cleared on second click or via the "Clear highlight" button.
  const [highlightSessionId, setHighlightSessionId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <DailySummaryCard />

      {/* Feature 1 — visual day timeline */}
      <TimelineGantt
        dayStart={dayStart}
        plannedBlocks={plannedBlocks}
        sessions={sessions}
        highlightSessionId={highlightSessionId}
        onHighlightClear={() => setHighlightSessionId(null)}
      />

      {/* Honest score card */}
      <div className="grid grid-cols-3 gap-3">
        <ScoreTile
          label="On plan"
          value={`${onPlanPct}%`}
          color={onPlanPct >= 80 ? '#10b981' : onPlanPct >= 50 ? '#f59e0b' : '#dc2626'}
        />
        <ScoreTile label="Saved" value={fmtShort(saved)} color="#10b981" />
        <ScoreTile label="Drifted" value={fmtShort(drifted)} color="#dc2626" />
      </div>

      {/* Export */}
      <div className="flex items-center justify-end">
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="px-3 py-1 rounded-lg border-[1.5px] border-[#e5e7eb] bg-white text-xs font-bold text-[#666] cursor-pointer hover:border-[#8b5cf6] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export CSV
        </button>
      </div>

      {/* Per-block rows (kept from the previous view — still useful as a chronological log) */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <PlannedVsActualRow key={r.blockId} row={r} />
          ))}
        </div>
      )}

      {/* Unplanned section — rows are clickable to highlight on the Gantt above */}
      {unplanned.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#888] mb-2">
            Off plan ·{' '}
            {fmtShort(unplanned.reduce((s, u) => s + (u.duration_seconds ?? 0), 0))}{' '}
            total
          </div>
          <div className="flex flex-col gap-2">
            {unplanned.map((s) => {
              const task = tasks.find((t) => t.id === s.task_id);
              const isHi = highlightSessionId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    setHighlightSessionId((prev) => (prev === s.id ? null : s.id))
                  }
                  className="bg-white rounded-lg px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex justify-between items-center text-left border-0 cursor-pointer transition-all"
                  style={{
                    outline: isHi ? '2px solid #f59e0b' : 'none',
                    outlineOffset: 2,
                  }}
                >
                  <span className="text-[13px] text-[#1a1a2e]">
                    {task?.title ?? 'Deleted task'}
                  </span>
                  <span className="text-[12px] font-bold text-[#f59e0b]">
                    {fmtShort(s.duration_seconds ?? 0)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
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
    <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#888]">
        {label}
      </div>
      <div className="text-[22px] font-extrabold mt-1" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function PlannedVsActualRow({ row }: { row: RowSummary }) {
  const maxSeconds = Math.max(row.plannedSeconds, row.actualSeconds, 1);
  const plannedPct = (row.plannedSeconds / maxSeconds) * 100;
  const actualPct = (row.actualSeconds / maxSeconds) * 100;

  const BADGE: Record<RowSummary['status'], { label: string; color: string; bg: string }> = {
    on_time: { label: '✓ On time', color: '#10b981', bg: '#d1fae5' },
    over: {
      label: `+${fmtShort(row.actualSeconds - row.plannedSeconds)} over`,
      color: '#dc2626',
      bg: '#fee2e2',
    },
    under: {
      label: `−${fmtShort(row.plannedSeconds - row.actualSeconds)} under`,
      color: '#10b981',
      bg: '#d1fae5',
    },
    tracking: { label: '● Tracking', color: '#8b5cf6', bg: '#ede9fe' },
    skipped: { label: 'Skipped', color: '#dc2626', bg: '#fee2e2' },
  };

  const badge = BADGE[row.status];
  const titleStyle =
    row.status === 'skipped'
      ? 'line-through text-[#888]'
      : 'text-[#1a1a2e]';

  return (
    <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-2">
        <div className={`text-[13px] font-bold ${titleStyle}`}>{row.taskTitle}</div>
        <span
          className="text-[10px] font-bold px-2 py-[2px] rounded-md"
          style={{ background: badge.bg, color: badge.color }}
        >
          {badge.label}
        </span>
      </div>
      <div className="relative h-[20px]">
        <div
          className="absolute top-[7px] h-[3px] rounded"
          style={{ width: `${plannedPct}%`, background: 'rgba(139,92,246,0.35)' }}
        />
        <div
          className="absolute top-[4px] h-[9px] rounded"
          style={{ width: `${actualPct}%`, background: '#8b5cf6' }}
        />
      </div>
      <div className="text-[11px] text-[#888] mt-1">
        Planned {fmtShort(row.plannedSeconds)} · Actual {fmtShort(row.actualSeconds)}
      </div>
    </div>
  );
}

