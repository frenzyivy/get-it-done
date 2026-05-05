'use client';

import { useCallback, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { addDays, startOfWeekMonday } from '@/lib/dateUtils';
import type { ScheduleSubView } from '@/types';

// Feature 14 — single source of truth for Schedule date navigation. The hook
// reads the store-backed `scheduleDayStartMs` and adapts step size + title
// format to the active sub-view. All three sub-views and the nav pill consume
// this so there's no sync drift between them.

export interface ScheduleNav {
  selectedDate: Date;
  subView: ScheduleSubView;
  title: string;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  // Pin to day 1 first so months with fewer days don't overflow forward
  // (Jan 31 + 1 month must land in February, not March).
  out.setDate(1);
  out.setMonth(out.getMonth() + n);
  return out;
}

function formatDayTitle(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatMonthTitle(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatWeekTitle(weekStart: Date): string {
  const last = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === last.getMonth();
  const sameYear = weekStart.getFullYear() === last.getFullYear();
  const startMonth = weekStart.toLocaleDateString(undefined, { month: 'short' });
  const endMonth = last.toLocaleDateString(undefined, { month: 'short' });
  if (sameMonth && sameYear) {
    return `${startMonth} ${weekStart.getDate()} – ${last.getDate()}`;
  }
  if (sameYear) {
    return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${last.getDate()}`;
  }
  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${last.getDate()}, ${last.getFullYear()}`;
}

export function useScheduleNav(): ScheduleNav {
  const subView = useStore((s) => s.scheduleSubView);
  const dayStartMs = useStore((s) => s.scheduleDayStartMs);
  const setScheduleDayStart = useStore((s) => s.setScheduleDayStart);

  const selectedDate = useMemo(() => new Date(dayStartMs), [dayStartMs]);

  const title = useMemo(() => {
    if (subView === 'day') return formatDayTitle(selectedDate);
    if (subView === 'month') return formatMonthTitle(selectedDate);
    return formatWeekTitle(startOfWeekMonday(selectedDate));
  }, [selectedDate, subView]);

  const goPrev = useCallback(() => {
    if (subView === 'day') {
      setScheduleDayStart(addDays(selectedDate, -1));
    } else if (subView === 'week') {
      setScheduleDayStart(addDays(selectedDate, -7));
    } else {
      setScheduleDayStart(addMonths(selectedDate, -1));
    }
  }, [selectedDate, subView, setScheduleDayStart]);

  const goNext = useCallback(() => {
    if (subView === 'day') {
      setScheduleDayStart(addDays(selectedDate, 1));
    } else if (subView === 'week') {
      setScheduleDayStart(addDays(selectedDate, 7));
    } else {
      setScheduleDayStart(addMonths(selectedDate, 1));
    }
  }, [selectedDate, subView, setScheduleDayStart]);

  const goToday = useCallback(() => {
    setScheduleDayStart(new Date());
  }, [setScheduleDayStart]);

  return { selectedDate, subView, title, goPrev, goNext, goToday };
}
