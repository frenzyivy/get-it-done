'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { StreakRing } from './StreakRing';
import { DailyProgressStat } from './DailyProgressStat';
import { TodaySoFarCard } from './TodaySoFarCard';
import { WhenYouWorkCard } from './WhenYouWorkCard';
import { StreakHistoryCard } from './StreakHistoryCard';

// Spec § Change #6 — Daily Progress tab inside Insights. Shows:
// 1. Streak ring (current streak + arc to next milestone)
// 2. Today (1 / 5)
// 3. This week (X / 35) + delta vs last week
// 4. 30-day average + completion rate
// 5. Today so far list with day picker
// 6. When You Work heatmap (Phase 4 step 12)
// 7. Streak history line chart (Phase 6 backlog) — replays the focus-session
//     streak rule across 84 days via /api/insights/streak-history

const DAILY_TARGET = 5; // "Today's 5" rule from PLAN.md / spec

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

export function DailyProgressTab() {
  const tasks = useStore((s) => s.tasks);
  const profileV2 = useStore((s) => s.profileV2);

  const stats = useMemo(() => {
    const now = new Date();
    const todayKey = ymd(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const thisWeekStart = startOfWeekSunday(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Today: tasks planned for today AND done today
    const todayPlanned = tasks.filter((t) => t.planned_for_date === todayKey);
    const todayDone = todayPlanned.filter(
      (t) => t.effective_status === 'done',
    ).length;

    // Helper: was a task done within [start, end)?
    // Done is detected via completed_at when present (Phase 1 step 3 derive),
    // falling back to effective_status === 'done' when completed_at is missing
    // (legacy rows). The fallback can over-count older completions that
    // aren't in scope; acceptable for v1 stat directionality.
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

    // 30-day completion rate: days where ≥1 done / 30
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
    <div>
      {/* Top row: streak ring (left) + 3 stat cards */}
      <div
        className="grid gap-3 mb-4"
        style={{ gridTemplateColumns: 'auto 1fr 1fr 1fr' }}
      >
        {/* Streak card */}
        <div
          className="rounded-[14px] p-4 flex flex-col items-center justify-center"
          style={{ background: '#1a1a2e', minWidth: 120 }}
        >
          <StreakRing current={currentStreak} />
          <div className="text-[10px] font-mono uppercase tracking-[1px] mt-2 text-white/55">
            Day streak
          </div>
          <div className="text-[10px] text-white/45 mt-1 text-center">
            best yet · {longestStreak}d
          </div>
        </div>

        <DailyProgressStat
          label="Today"
          value={`${stats.todayDone} / ${DAILY_TARGET}`}
          sub={
            hoursRemaining > 0
              ? `${hoursRemaining} more to hit goal`
              : 'goal hit ✓'
          }
        />
        <DailyProgressStat
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
        <DailyProgressStat
          label="30-day average"
          value={`${stats.avg30} / ${DAILY_TARGET}`}
          sub={`${stats.completionRate}% completion rate`}
        />
      </div>

      <TodaySoFarCard />
      <WhenYouWorkCard />
      <StreakHistoryCard />
    </div>
  );
}
