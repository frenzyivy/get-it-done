'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { CalendarTargetEditor } from './CalendarTargetEditor';
import { CalendarGrid } from './CalendarGrid';
import { CalendarLegend } from './CalendarLegend';
import { CalendarWeeklyStrip } from './CalendarWeeklyStrip';

// Spec § Calendar — top-level. Owns the visible-month state and triggers a
// per-day session fetch whenever the month changes. The weekly strip pulls
// from the same `secondsByDay` map; if the strip's 5-week window extends
// before the grid range, the strip's earliest weeks just show 0 — acceptable
// for v1, lifted to Phase 6 if the discrepancy becomes visible.

export function CalendarView() {
  const dailyTargets = useStore((s) => s.dailyTargets);
  const fetchDailyTargets = useStore((s) => s.fetchDailyTargets);
  const secondsByDay = useStore((s) => s.secondsByDay);
  const fetchSessionsByDay = useStore((s) => s.fetchSessionsByDay);

  const [monthStart, setMonthStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Lazy-fetch daily_targets the first time the view mounts (fetchAll already
  // tries; this catches the case where the user signs in after page load).
  useEffect(() => {
    if (!dailyTargets) void fetchDailyTargets();
  }, [dailyTargets, fetchDailyTargets]);

  // Fetch the session bucket whenever the visible month changes. Range is
  // padded ±1 month so the weekly strip (5 weeks ending today) has data.
  useEffect(() => {
    const fromDate = new Date(monthStart);
    fromDate.setDate(monthStart.getDate() - 35);
    const toDate = new Date(monthStart);
    toDate.setMonth(monthStart.getMonth() + 1);
    toDate.setDate(7);
    void fetchSessionsByDay(ymd(fromDate), ymd(toDate));
  }, [monthStart, fetchSessionsByDay]);

  const monthLabel = useMemo(
    () =>
      monthStart.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [monthStart],
  );

  if (!dailyTargets) {
    return (
      <div className="text-center py-10 text-[#aaa] text-sm">
        Loading calendar…
      </div>
    );
  }

  return (
    <div>
      <CalendarTargetEditor targets={dailyTargets} />

      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setMonthStart(addMonths(monthStart, -1))}
          className="text-xs px-2 py-1 rounded-md border-[1.5px] border-[#e5e7eb] bg-white cursor-pointer hover:border-[#1a1a2e] transition-colors"
          aria-label="Previous month"
        >
          ←
        </button>
        <span className="text-[14px] font-extrabold text-[#1a1a2e]">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => setMonthStart(addMonths(monthStart, 1))}
          className="text-xs px-2 py-1 rounded-md border-[1.5px] border-[#e5e7eb] bg-white cursor-pointer hover:border-[#1a1a2e] transition-colors"
          aria-label="Next month"
        >
          →
        </button>
        <button
          type="button"
          onClick={() => {
            const d = new Date();
            d.setDate(1);
            d.setHours(0, 0, 0, 0);
            setMonthStart(d);
          }}
          className="ml-2 text-[11px] text-[#888] underline cursor-pointer bg-transparent border-0 hover:text-[#1a1a2e]"
        >
          today
        </button>
      </div>

      <CalendarGrid
        monthStart={monthStart}
        secondsByDay={secondsByDay}
        targets={dailyTargets}
      />
      <CalendarLegend />
      <CalendarWeeklyStrip
        anchor={new Date()}
        secondsByDay={secondsByDay}
        targets={dailyTargets}
      />
    </div>
  );
}

function addMonths(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setMonth(d.getMonth() + delta);
  return next;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
