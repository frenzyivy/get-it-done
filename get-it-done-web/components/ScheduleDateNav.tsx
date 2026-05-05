'use client';

import { useEffect } from 'react';
import { useScheduleNav } from '@/lib/useScheduleNav';

// Feature 14 — adaptive `‹ {title} ›  [Today]` nav pill. Step size and title
// format come from useScheduleNav, which switches on the active sub-view.
// Keyboard shortcuts: J = prev, K = next, T = today. Listener bails on inputs
// and modifier keys so global shortcuts (Ctrl+K Quick Add, typing in fields)
// pass through untouched.

const ARROW_LABELS: Record<'day' | 'week' | 'month', { prev: string; next: string }> = {
  day: { prev: 'Previous day', next: 'Next day' },
  week: { prev: 'Previous week', next: 'Next week' },
  month: { prev: 'Previous month', next: 'Next month' },
};

export function ScheduleDateNav() {
  const { subView, title, goPrev, goNext, goToday } = useScheduleNav();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.matches('input, textarea, select, [contenteditable="true"]') ||
          target.closest('[role="dialog"]'))
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'j') {
        e.preventDefault();
        goPrev();
      } else if (k === 'k') {
        e.preventDefault();
        goNext();
      } else if (k === 't') {
        e.preventDefault();
        goToday();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, goToday]);

  const labels = ARROW_LABELS[subView];

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center gap-1 rounded-full border border-[#e5e7eb] bg-white px-1 py-0.5">
        <button
          type="button"
          onClick={goPrev}
          aria-label={labels.prev}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6]"
        >
          ‹
        </button>
        <span className="px-2 text-[12px] font-semibold text-[#1a1a2e] tabular-nums">
          {title}
        </span>
        <button
          type="button"
          onClick={goNext}
          aria-label={labels.next}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6]"
        >
          ›
        </button>
      </div>
      <button
        type="button"
        onClick={goToday}
        className="rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-[12px] font-semibold text-[#1a1a2e] hover:bg-[#f3f4f6]"
      >
        Today
      </button>
    </div>
  );
}
