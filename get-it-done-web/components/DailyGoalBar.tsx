'use client';

import { useStore } from '@/lib/store';
import { fmtShort, isToday } from '@/lib/utils';
import { ProgressBar } from './ProgressBar';

// v2 spec §4 — momentum engine replacing "1 tasks · 0% · 8s".
// Goal met when tasks completed today >= daily_task_goal. We fall back to a
// default of 3 tasks while user_profiles is still being fetched.
export function DailyGoalBar() {
  const tasks = useStore((s) => s.tasks);
  const profile = useStore((s) => s.profileV2);
  const sessions = useStore((s) =>
    s.tasks.flatMap((t) => t.sessions),
  );

  const goal = profile?.daily_task_goal ?? 3;
  const streak = profile?.current_streak ?? 0;

  const completedToday = tasks.filter(
    (t) => t.status === 'done' && isToday(t.sessions[t.sessions.length - 1]?.started_at),
  ).length;

  const focusTodaySeconds = sessions
    .filter((s) => isToday(s.started_at))
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);

  const pct = Math.min(100, Math.round((completedToday / goal) * 100));
  const met = completedToday >= goal;

  return (
    <div
      className="rounded-[14px] px-4 py-3"
      style={{
        background: met
          ? 'linear-gradient(135deg, #d1fae5, #a7f3d0)'
          : 'linear-gradient(135deg, #ede9fe, #ddd6fe)',
        border: `1.5px solid ${met ? '#10b981' : 'rgba(139,92,246,0.25)'}`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#1a1a2e]">
            Today&apos;s goal
          </span>
          <span
            className="text-[12px] font-bold"
            style={{ color: met ? '#10b981' : '#8b5cf6' }}
          >
            {met ? '✓ ' : ''}
            {completedToday} / {goal} tasks
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-semibold text-[#555]">
          <span title="Current streak">🔥 {streak}-day streak</span>
          <span title="Total focused time today">
            🕐 {fmtShort(focusTodaySeconds)}
          </span>
        </div>
      </div>
      <ProgressBar
        value={pct}
        height={6}
        accent={met ? '#10b981' : '#8b5cf6'}
      />
    </div>
  );
}
