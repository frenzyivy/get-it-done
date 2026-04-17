'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { NotificationType } from '@/types';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const KIND_EMOJI: Record<string, string> = {
  overdue: '⚠️',
  due_soon: '⏰',
  priority_bumped: '⬆️',
  recurring_created: '🔄',
  daily_summary: '☀️',
  completion_celebrate: '🎉',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const notifications = useStore((s) => s.notifications);
  const markRead = useStore((s) => s.markNotificationRead);
  const markAllRead = useStore((s) => s.markAllNotificationsRead);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleItemClick = (n: NotificationType) => {
    if (!n.read_at) markRead(n.id);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 rounded-lg border-[1.5px] border-[#e5e7eb] bg-white flex items-center justify-center cursor-pointer hover:border-[#8b5cf6] transition-colors"
        aria-label={`Notifications (${unread} unread)`}
      >
        <span className="text-base">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#dc2626] text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-50 w-[340px] bg-white rounded-[14px] shadow-[0_8px_30px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] max-h-[480px] flex flex-col">
          <div className="flex items-center justify-between px-[14px] py-3 border-b border-[#eee]">
            <span className="text-[13px] font-extrabold uppercase tracking-[0.5px] text-[#1a1a2e]">
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-[#8b5cf6] font-semibold bg-transparent border-0 cursor-pointer hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="text-center py-10 text-[#aaa] text-sm">
                Nothing here yet. Automations will post updates as they happen.
              </div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`w-full text-left px-[14px] py-3 border-b border-black/[.04] flex gap-3 cursor-pointer transition-colors ${
                  n.read_at ? 'bg-white' : 'bg-[rgba(139,92,246,0.04)]'
                } hover:bg-black/[.02]`}
              >
                <span className="text-lg leading-none shrink-0">
                  {KIND_EMOJI[n.kind] ?? '🔔'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[13px] ${
                        n.read_at ? 'font-semibold text-[#555]' : 'font-bold text-[#1a1a2e]'
                      } truncate`}
                    >
                      {n.title}
                    </span>
                    {!n.read_at && (
                      <span className="w-2 h-2 rounded-full bg-[#8b5cf6] shrink-0" />
                    )}
                  </div>
                  {n.body && (
                    <div className="text-[12px] text-[#888] mt-1 line-clamp-2">
                      {n.body}
                    </div>
                  )}
                  <div className="text-[11px] text-[#aaa] mt-1">
                    {timeAgo(n.created_at)} ago
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
