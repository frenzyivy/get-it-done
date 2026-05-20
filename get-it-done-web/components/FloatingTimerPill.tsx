'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useLiveTimers } from '@/lib/useLiveTimer';
import { fmt } from '@/lib/utils';

// Phase 8 — Sticky desktop timer (in-app variant).
//
// Pinned to a chosen corner of the viewport. Always rendered when there's at
// least one live tracked_session AND the user has the toggle on AND we're
// not on the dashboard (where NowTrackingBar already takes the top slot —
// rendering both would be visual duplication).
//
// The pill collapses to a tiny duration-only badge when clicked to give it
// the brief's "minimized to a tiny pill" affordance. Click again to restore.

const POSITION_STYLE: Record<
  string,
  { bottom?: number; right?: number; top?: number; left?: number }
> = {
  bottom_right: { bottom: 16, right: 16 },
  bottom_left: { bottom: 16, left: 16 },
  top_right: { top: 16, right: 16 },
  top_left: { top: 16, left: 16 },
};

export function FloatingTimerPill() {
  const pathname = usePathname();
  const prefs = useStore((s) => s.prefs);
  const activeSessions = useStore((s) => s.activeSessions);
  const tasks = useStore((s) => s.tasks);
  const stopSession = useStore((s) => s.stopSession);
  const startBreak = useStore((s) => s.startBreak);
  const endBreak = useStore((s) => s.endBreak);

  const elapsedMap = useLiveTimers();
  const [minimized, setMinimized] = useState(false);
  const enabled = prefs?.sticky_timer_enabled ?? true;
  const position = prefs?.sticky_timer_position ?? 'bottom_right';

  // Suppress on the dashboard — NowTrackingBar already renders the live
  // session at the top of the page. Visible on /insights, /settings, and
  // anywhere else the user navigates to during a session.
  const isDashboard = pathname === '/dashboard' || pathname === '/';

  // Esc closes the pill (minimizes, not stops). Lets a user kill a visual
  // distraction without ending the timer.
  useEffect(() => {
    if (!enabled || isDashboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMinimized((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, isDashboard]);

  if (!enabled) return null;
  if (isDashboard) return null;
  if (activeSessions.length === 0) return null;

  // For multiple concurrent timers, surface the first one in the pill;
  // counter shows the rest. Matches the NowTrackingBar pattern.
  const primary = activeSessions[0];
  const task = tasks.find((t) => t.id === primary.task_id);
  const elapsed = elapsedMap[primary.id] ?? 0;
  const more = activeSessions.length - 1;
  const isOnBreak = primary.is_on_break;

  const stylePos = POSITION_STYLE[position];

  return (
    <div
      className="fixed z-[90] transition-all"
      style={{ ...stylePos }}
    >
      <div
        className="rounded-full text-white flex items-center gap-2 px-3 py-[6px] cursor-pointer select-none"
        style={{
          background: isOnBreak
            ? 'linear-gradient(110deg, #92400e 0%, #b45309 100%)'
            : 'linear-gradient(110deg, #11142A 0%, #1A1F44 40%, #2A2350 60%, #15172E 100%)',
          boxShadow:
            '0 12px 30px -10px rgba(20, 14, 60, 0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
          minHeight: 32,
        }}
        onClick={() => setMinimized((v) => !v)}
        title={
          minimized
            ? 'Click to expand the timer'
            : 'Click to minimize'
        }
      >
        <span
          aria-hidden
          className="w-[6px] h-[6px] rounded-full bg-red-400 animate-pulse"
        />
        <span className="font-mono tabular-nums font-extrabold text-[13px]">
          {fmt(elapsed)}
        </span>
        {!minimized && (
          <>
            <span className="opacity-30">·</span>
            <span
              className="text-[12px] font-medium max-w-[180px] truncate"
              title={task?.title ?? 'Tracking'}
            >
              {task?.title ?? 'Tracking'}
              {more > 0 && (
                <span className="ml-1 opacity-65 text-[10px] font-mono">
                  +{more} more
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isOnBreak) void endBreak(primary.id);
                else void startBreak(primary.id);
              }}
              className="ml-1 bg-white/10 hover:bg-white/20 border-0 text-white text-[10px] font-bold px-[6px] py-[2px] rounded-full cursor-pointer"
              title={isOnBreak ? 'Resume' : 'Pause for a break'}
              aria-label={isOnBreak ? 'Resume' : 'Pause for a break'}
            >
              {isOnBreak ? '▶' : '⏸'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void stopSession(primary.id);
              }}
              className="bg-red-500/20 hover:bg-red-500/35 border-0 text-red-200 text-[10px] font-bold px-[6px] py-[2px] rounded-full cursor-pointer"
              title="Stop tracking"
              aria-label="Stop tracking"
            >
              ■
            </button>
          </>
        )}
      </div>
    </div>
  );
}
