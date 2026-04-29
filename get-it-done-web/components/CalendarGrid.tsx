'use client';

import { CalendarDay } from './CalendarDay';
import type { DailyTargets } from '@/types';

interface Props {
  monthStart: Date; // 1st of the displayed month, in local time
  // Map keyed YYYY-MM-DD → seconds tracked that day. Missing keys = 0.
  secondsByDay: Record<string, number>;
  targets: DailyTargets;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Spec § Calendar — month grid. Sun-first columns to match JS Date.getDay().
// Renders a 6-row x 7-col grid; days outside the displayed month dim to 0.45.
export function CalendarGrid({ monthStart, secondsByDay, targets }: Props) {
  const cells: { date: Date; inMonth: boolean }[] = [];

  // Roll back to the Sunday that starts the visible week.
  const firstCell = new Date(monthStart);
  firstCell.setDate(monthStart.getDate() - monthStart.getDay());

  for (let i = 0; i < 42; i++) {
    const d = new Date(firstCell);
    d.setDate(firstCell.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === monthStart.getMonth() });
  }

  const today = new Date();
  const todayKey = ymd(today);

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: '#1a1a2e',
        color: '#fff',
        boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
      }}
    >
      <div className="grid grid-cols-7 gap-2 mb-2">
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-mono uppercase tracking-wider text-white/45"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((cell) => {
          const key = ymd(cell.date);
          const seconds = secondsByDay[key] ?? 0;
          const target = targetHoursFor(cell.date, targets);
          return (
            <CalendarDay
              key={key}
              date={cell.date}
              inMonth={cell.inMonth}
              isToday={key === todayKey}
              secondsLogged={seconds}
              targetHours={target}
            />
          );
        })}
      </div>
    </div>
  );
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Date.getDay() returns 0=Sun..6=Sat; daily_targets columns are mon..sun.
function targetHoursFor(date: Date, t: DailyTargets): number {
  switch (date.getDay()) {
    case 0: return t.sun;
    case 1: return t.mon;
    case 2: return t.tue;
    case 3: return t.wed;
    case 4: return t.thu;
    case 5: return t.fri;
    case 6: return t.sat;
    default: return 0;
  }
}
