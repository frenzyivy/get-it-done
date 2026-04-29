'use client';

import { fmtShort } from '@/lib/utils';
import type { DailyTargets } from '@/types';

interface Props {
  // Anchor — usually today. We render the 5 weeks ending in this anchor's
  // week (so the rightmost card is the current week).
  anchor: Date;
  secondsByDay: Record<string, number>;
  targets: DailyTargets;
}

// Spec § Calendar — "Weekly totals strip" below the grid. 5 small cards,
// each showing one week's hours / weekly target with a thin progress bar.
// Weeks here are Sun → Sat to match the calendar grid.
export function CalendarWeeklyStrip({ anchor, secondsByDay, targets }: Props) {
  const weeklyTarget =
    targets.mon + targets.tue + targets.wed + targets.thu +
    targets.fri + targets.sat + targets.sun;

  // Sunday that starts the anchor's week.
  const anchorWeekStart = new Date(anchor);
  anchorWeekStart.setDate(anchor.getDate() - anchor.getDay());
  anchorWeekStart.setHours(0, 0, 0, 0);

  const weeks: { start: Date; seconds: number }[] = [];
  for (let i = 4; i >= 0; i--) {
    const start = new Date(anchorWeekStart);
    start.setDate(anchorWeekStart.getDate() - i * 7);
    let seconds = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + d);
      seconds += secondsByDay[ymd(day)] ?? 0;
    }
    weeks.push({ start, seconds });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-3">
      {weeks.map((w) => {
        const hours = w.seconds / 3600;
        const ratio =
          weeklyTarget > 0 ? Math.min(1, hours / weeklyTarget) : hours > 0 ? 1 : 0;
        return (
          <div
            key={w.start.toISOString()}
            className="rounded-xl p-3"
            style={{
              background: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(0,0,0,0.06)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af]">
              week of {monthDay(w.start)}
            </div>
            <div className="text-[14px] font-extrabold text-[#1a1a2e] mt-[2px]">
              {fmtShort(w.seconds)}
              <span className="text-[#888] font-normal text-[11px]">
                {' '}/ {weeklyTarget}h
              </span>
            </div>
            <div
              className="rounded-full h-[4px] overflow-hidden mt-[6px]"
              style={{ background: 'rgba(0,0,0,0.06)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${ratio * 100}%`, background: '#1a1a2e' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
