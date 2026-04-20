'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { fmtShort } from '@/lib/utils';
import { DailySummaryCard } from './DailySummaryCard';
import { TimelineGantt } from './TimelineGantt';
import type { TrackedSession } from '@/types';

// Timeline page — the day Gantt up top and a weekly-progress footer showing
// Worked / Not worked / Goal vs Work (pie) over the current Sun→Sat week.

const DAY_MS = 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;

export function TimelineView() {
  const userId = useStore((s) => s.userId);
  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const activeSessions = useStore((s) => s.activeSessions);
  const prefs = useStore((s) => s.prefs);
  const updatePrefs = useStore((s) => s.updatePrefs);

  const dayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const dayEnd = useMemo(() => new Date(dayStart.getTime() + DAY_MS), [dayStart]);

  // Week window: Sunday 00:00 local → following Sunday 00:00 local.
  const weekStart = useMemo(() => {
    const d = new Date(dayStart);
    d.setDate(d.getDate() - d.getDay()); // JS: Sunday = 0
    d.setHours(0, 0, 0, 0);
    return d;
  }, [dayStart]);
  const weekEnd = useMemo(
    () => new Date(weekStart.getTime() + 7 * DAY_MS),
    [weekStart],
  );

  useEffect(() => {
    if (!userId) return;
    void fetchPlannedBlocks(dayStart.toISOString(), dayEnd.toISOString());
  }, [userId, fetchPlannedBlocks, dayStart, dayEnd]);

  // Sessions for the Gantt (today only).
  const [sessions, setSessions] = useState<TrackedSession[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
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
  }, [userId, dayStart, dayEnd, refreshTick]);

  // Sessions for the whole week — feeds the three footer cards.
  const [weekSessions, setWeekSessions] = useState<TrackedSession[]>([]);
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const { data } = await supabase()
        .from('tracked_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', weekStart.toISOString())
        .lt('started_at', weekEnd.toISOString());
      setWeekSessions((data ?? []) as TrackedSession[]);
    })();
  }, [userId, weekStart, weekEnd, refreshTick]);

  // Tick once a minute so any live session's "now" contribution updates.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Total worked seconds this week. For live sessions (no ended_at), use
  // (now - started_at) so the pie moves as you work; capped by the week end.
  const workedSeconds = useMemo(() => {
    const weekEndMs = weekEnd.getTime();
    const liveIds = new Set(activeSessions.map((a) => a.id));
    let total = 0;
    for (const s of weekSessions) {
      if (s.ended_at || !liveIds.has(s.id)) {
        total += s.duration_seconds ?? 0;
      } else {
        const start = new Date(s.started_at).getTime();
        const end = Math.min(nowMs, weekEndMs);
        total += Math.max(0, Math.floor((end - start) / 1000));
      }
    }
    return total;
  }, [weekSessions, activeSessions, nowMs, weekEnd]);

  const goalHours = prefs?.weekly_work_goal_hours ?? 40;
  const goalSeconds = goalHours * 3600;
  const notWorkedSeconds = Math.max(0, goalSeconds - workedSeconds);
  const pct = goalSeconds > 0 ? Math.min(100, (workedSeconds / goalSeconds) * 100) : 0;

  const exportCsv = () => {
    const header = 'session_id,started_at,ended_at,duration_seconds';
    const body = weekSessions
      .map((s) =>
        [s.id, s.started_at, s.ended_at ?? '', s.duration_seconds ?? 0].join(','),
      )
      .join('\n');
    const csv = `${header}\n${body}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `week_${weekStart.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [highlightSessionId, setHighlightSessionId] = useState<string | null>(null);

  // "What I worked on today" list — every tracked session for today,
  // grouped/aggregated by task so two sessions on the same task collapse into
  // one row. Click a row to highlight that task's block on the Gantt.
  const todayWorkItems = useMemo(() => {
    const liveIds = new Set(activeSessions.map((a) => a.id));
    const byTask = new Map<
      string,
      { taskId: string | null; title: string; seconds: number; lastSessionId: string }
    >();
    for (const s of sessions) {
      let dur = 0;
      if (s.ended_at) {
        dur = s.duration_seconds ?? 0;
      } else if (liveIds.has(s.id)) {
        const start = new Date(s.started_at).getTime();
        dur = Math.max(0, Math.floor((nowMs - start) / 1000));
      } else {
        continue;
      }
      if (dur <= 0) continue;
      const key = s.task_id ?? `_none_${s.id}`;
      const title = tasks.find((t) => t.id === s.task_id)?.title ?? 'Deleted task';
      const prev = byTask.get(key);
      if (prev) {
        prev.seconds += dur;
        prev.lastSessionId = s.id;
      } else {
        byTask.set(key, { taskId: s.task_id, title, seconds: dur, lastSessionId: s.id });
      }
    }
    return Array.from(byTask.values()).sort((a, b) => b.seconds - a.seconds);
  }, [sessions, tasks, activeSessions, nowMs]);

  const todayTotalSeconds = todayWorkItems.reduce((sum, r) => sum + r.seconds, 0);

  const weekLabel = `${weekStart.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })} – ${new Date(weekEnd.getTime() - HOUR_MS).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })}`;

  return (
    <div className="flex flex-col gap-4">
      <DailySummaryCard />

      <TimelineGantt
        dayStart={dayStart}
        plannedBlocks={plannedBlocks}
        sessions={sessions}
        highlightSessionId={highlightSessionId}
        onHighlightClear={() => setHighlightSessionId(null)}
        onSessionsChanged={() => setRefreshTick((t) => t + 1)}
      />

      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#888]">
          This week · {weekLabel}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Total time worked"
          value={fmtShort(workedSeconds)}
          color="#10b981"
        />
        <StatCard
          label="Total time not worked"
          value={fmtShort(notWorkedSeconds)}
          color="#dc2626"
        />
        <GoalPieCard
          workedSeconds={workedSeconds}
          goalHours={goalHours}
          pct={pct}
          onSaveGoal={async (hours) => {
            await updatePrefs({ weekly_work_goal_hours: hours });
          }}
        />
      </div>

      <div className="flex items-center justify-end">
        <button
          onClick={exportCsv}
          disabled={weekSessions.length === 0}
          className="px-3 py-1 rounded-lg border-[1.5px] border-[#e5e7eb] bg-white text-xs font-bold text-[#666] cursor-pointer hover:border-[#8b5cf6] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export CSV
        </button>
      </div>

      {todayWorkItems.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#888] mb-2">
            Worked on today · {fmtShort(todayTotalSeconds)} total
          </div>
          <div className="flex flex-col gap-2">
            {todayWorkItems.map((item) => {
              const isHi = highlightSessionId === item.lastSessionId;
              return (
                <button
                  key={item.lastSessionId}
                  onClick={() =>
                    setHighlightSessionId((prev) =>
                      prev === item.lastSessionId ? null : item.lastSessionId,
                    )
                  }
                  className="bg-white rounded-lg px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex justify-between items-center text-left border-0 cursor-pointer transition-all"
                  style={{
                    outline: isHi ? '2px solid #f59e0b' : 'none',
                    outlineOffset: 2,
                  }}
                >
                  <span className="text-[13px] text-[#1a1a2e]">{item.title}</span>
                  <span className="text-[12px] font-bold text-[#f59e0b]">
                    {fmtShort(item.seconds)}
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

function StatCard({
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

// Goal vs Work — donut chart (SVG, no dep). Fill proportion = worked / goal,
// with an inline pencil that swaps to a number input + Save.
function GoalPieCard({
  workedSeconds,
  goalHours,
  pct,
  onSaveGoal,
}: {
  workedSeconds: number;
  goalHours: number;
  pct: number;
  onSaveGoal: (hours: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goalHours));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(goalHours));
  }, [goalHours, editing]);

  const save = async () => {
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n) || n <= 0 || n > 168) return;
    setBusy(true);
    try {
      await onSaveGoal(n);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const R = 28;
  const C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;
  const workedHrs = workedSeconds / 3600;
  const workedLabel =
    workedHrs >= 10
      ? `${Math.round(workedHrs)}h`
      : `${workedHrs.toFixed(1)}h`;

  return (
    <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] flex items-center gap-3">
      <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
        <circle cx="36" cy="36" r={R} fill="none" stroke="#f3f4f6" strokeWidth="8" />
        <circle
          cx="36"
          cy="36"
          r={R}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="8"
          strokeDasharray={`${dash} ${C - dash}`}
          strokeDashoffset={C / 4}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dasharray 300ms ease' }}
        />
        <text
          x="36"
          y="40"
          textAnchor="middle"
          fontSize="13"
          fontWeight="800"
          fill="#1a1a2e"
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#888]">
          Goal vs Work
        </div>
        {editing ? (
          <div className="flex items-center gap-1 mt-1">
            <input
              type="number"
              min={1}
              max={168}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-14 px-1 py-[2px] border border-[#e5e7eb] rounded-md text-[13px]"
              autoFocus
            />
            <span className="text-[12px] text-[#888]">h/wk</span>
            <button
              onClick={save}
              disabled={busy}
              className="ml-auto px-2 py-[2px] text-[11px] font-bold rounded-md bg-[#1a1a2e] text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1">
            <div className="text-[16px] font-extrabold text-[#1a1a2e]">
              {workedLabel} / {goalHours}h
            </div>
            <button
              onClick={() => setEditing(true)}
              className="text-[12px] text-[#888] hover:text-[#1a1a2e] bg-transparent border-0 cursor-pointer"
              title="Edit weekly goal"
            >
              ✎
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
