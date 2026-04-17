'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';

// Phase 7 — surfaces the most recent unread `daily_summary` notification as
// a rich card above the Timeline view. Claude-generated markdown is kept
// simple: we render body as plain text with paragraph breaks.
export function DailySummaryCard() {
  const notifications = useStore((s) => s.notifications);
  const markNotificationRead = useStore((s) => s.markNotificationRead);

  const summary = useMemo(() => {
    const unread = notifications
      .filter((n) => n.kind === 'daily_summary' && !n.read_at)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    return unread[0] ?? null;
  }, [notifications]);

  if (!summary) return null;

  const body = summary.body ?? '';
  const paragraphs = body.split('\n').filter((p) => p.trim().length > 0);

  return (
    <div
      className="rounded-[14px] p-5 mb-4 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
        borderLeft: '4px solid #f59e0b',
      }}
    >
      <button
        onClick={() => void markNotificationRead(summary.id)}
        className="absolute top-2 right-3 text-[#92400e] hover:text-[#78350f] bg-transparent border-0 cursor-pointer text-sm font-bold"
        title="Dismiss"
      >
        ×
      </button>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">☀️</span>
        <span className="text-xs font-extrabold uppercase tracking-[0.5px] text-[#92400e]">
          Morning briefing
        </span>
      </div>
      {paragraphs.map((p, i) => (
        <p key={i} className="text-[14px] text-[#1a1a2e] leading-relaxed mb-2">
          {p}
        </p>
      ))}
    </div>
  );
}
