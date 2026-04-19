'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { fmtShort, isToday, todayISO } from '@/lib/utils';
import { ProgressBar } from './ProgressBar';
import { TodayFiveDrawer } from './TodayFiveDrawer';

// "Today's 5" — pick exactly 5 tasks per day by setting their
// planned_for_date; the top 5 by sort_order count toward the goal. The bar
// is the entry point into the TodayFiveDrawer (click anywhere on it).
const DAILY_CAP = 5;

export function DailyGoalBar() {
  const tasks = useStore((s) => s.tasks);
  const profile = useStore((s) => s.profileV2);
  const [open, setOpen] = useState(false);

  const today = todayISO();
  const plannedForToday = tasks
    .filter((t) => t.planned_for_date === today)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const todaysFive = plannedForToday.slice(0, DAILY_CAP);
  const completedToday = todaysFive.filter((t) => t.status === 'done').length;

  const streak = profile?.current_streak ?? 0;

  const focusTodaySeconds = tasks
    .flatMap((t) => t.sessions)
    .filter((s) => isToday(s.started_at))
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);

  const pct = Math.min(100, Math.round((completedToday / DAILY_CAP) * 100));
  const met = completedToday >= DAILY_CAP;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-[14px] px-4 py-3 border-0 cursor-pointer transition-transform hover:scale-[1.005]"
        style={{
          background: met
            ? 'linear-gradient(135deg, #d1fae5, #a7f3d0)'
            : 'linear-gradient(135deg, #ede9fe, #ddd6fe)',
          border: `1.5px solid ${met ? '#10b981' : 'rgba(139,92,246,0.25)'}`,
        }}
        title="Open today's 5"
        aria-label="Open today's 5"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#1a1a2e]">
              Today&apos;s 5
            </span>
            <span
              className="text-[12px] font-bold"
              style={{ color: met ? '#10b981' : '#8b5cf6' }}
            >
              {met ? '✓ ' : ''}
              {completedToday} / {DAILY_CAP} tasks
            </span>
            {plannedForToday.length > DAILY_CAP && (
              <span
                className="text-[10px] font-bold text-[#666] bg-black/[.06] px-[6px] py-[1px] rounded-md"
                title={`${plannedForToday.length - DAILY_CAP} more queued for today`}
              >
                +{plannedForToday.length - DAILY_CAP} queued
              </span>
            )}
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
      </button>
      {open && <TodayFiveDrawer onClose={() => setOpen(false)} />}
    </>
  );
}
