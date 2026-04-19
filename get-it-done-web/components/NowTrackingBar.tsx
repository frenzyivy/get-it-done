'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { fmt, fmtShort } from '@/lib/utils';
import { useLiveTimers } from '@/lib/useLiveTimer';
import type { TrackedSession } from '@/types';

// New-spec-1 Feature 4 — the banner now renders a stack of active timers, one
// card per live session, each with its own pause/stop + full-screen shortcut.
// Feature 5 — every row has a "↗" button that opens the focus-mode fullscreen
// for that specific timer.
export function NowTrackingBar() {
  const activeSessions = useStore((s) => s.activeSessions);
  const tasks = useStore((s) => s.tasks);
  const stopSession = useStore((s) => s.stopSession);
  const pauseSession = useStore((s) => s.pauseSession);
  const openFocusMode = useStore((s) => s.openFocusMode);
  const lastStopSummary = useStore((s) => s.lastStopSummary);
  const clearStopSummary = useStore((s) => s.clearStopSummary);

  const elapsedMap = useLiveTimers();

  useEffect(() => {
    if (!lastStopSummary) return;
    const id = setTimeout(() => clearStopSummary(), 3000);
    return () => clearTimeout(id);
  }, [lastStopSummary, clearStopSummary]);

  if (activeSessions.length === 0 && !lastStopSummary) return null;

  if (activeSessions.length > 0) {
    const count = activeSessions.length;

    // Soft warning when tracking 3+ tasks at once.
    const warn = count >= 3;

    return (
      <div className="flex flex-col gap-2">
        {count >= 2 && (
          <div
            className="flex items-center justify-between px-3 py-[6px] rounded-lg text-[11px] font-bold uppercase tracking-[0.5px]"
            style={{
              background: warn ? '#fde68a' : 'rgba(139,92,246,0.08)',
              color: warn ? '#92400e' : '#6d5bd0',
            }}
          >
            <span>
              {warn ? '⚠ ' : ''}
              {count} timers running concurrently
            </span>
            {warn && <span className="opacity-80">Are you sure?</span>}
          </div>
        )}
        {activeSessions.map((sess) => {
          const task = tasks.find((t) => t.id === sess.task_id);
          const subtask = task?.subtasks.find((s) => s.id === sess.subtask_id);
          const elapsed = elapsedMap[sess.id] ?? 0;
          return (
            <TrackingRow
              key={sess.id}
              session={sess}
              elapsed={elapsed}
              taskTitle={task?.title ?? 'Tracking…'}
              subtaskTitle={subtask?.title ?? null}
              onPause={() => void pauseSession(sess.id)}
              onStop={() => void stopSession(sess.id)}
              onExpand={() => openFocusMode(sess.id)}
            />
          );
        })}
      </div>
    );
  }

  // lastStopSummary — saved toast
  return (
    <div
      className="rounded-[14px] px-4 py-3 flex items-center gap-3 animate-[fadeIn_0.3s_ease-out]"
      style={{ background: '#10b981', color: '#fff' }}
    >
      <span className="text-lg shrink-0">✓</span>
      <div className="flex-1">
        <div className="text-sm font-bold">
          Saved · {fmtShort(lastStopSummary!.durationSeconds)}
        </div>
      </div>
      <button
        onClick={clearStopSummary}
        className="bg-white/20 hover:bg-white/30 border-0 rounded-lg px-2 py-1 text-xs font-bold text-white cursor-pointer"
      >
        Dismiss
      </button>
    </div>
  );
}

function TrackingRow({
  session,
  elapsed,
  taskTitle,
  subtaskTitle,
  onPause,
  onStop,
  onExpand,
}: {
  session: TrackedSession;
  elapsed: number;
  taskTitle: string;
  subtaskTitle: string | null;
  onPause: () => void;
  onStop: () => void;
  onExpand: () => void;
}) {
  // Feature 2a — show "{Task} → {Subtask}" whenever a subtask timer is active.
  const label = subtaskTitle ? `${taskTitle} → ${subtaskTitle}` : taskTitle;
  const driftCount = session.drift_events?.length ?? 0;

  return (
    <div
      className="rounded-[14px] px-4 py-3 flex items-center gap-3"
      style={{ background: '#7F77DD', color: '#fff' }}
    >
      <span className="w-2 h-2 rounded-full bg-[#fca5a5] animate-[pomoPulse_1s_ease-in-out_infinite] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.5px] opacity-80 flex items-center gap-2">
          Now tracking
          {session.mode !== 'open' && session.mode !== 'free' && (
            <span className="bg-white/20 rounded px-[6px] py-[1px] text-[10px] tracking-normal normal-case font-bold">
              {labelForMode(session.mode)}
            </span>
          )}
          {driftCount > 0 && (
            <span
              className="bg-[#dc2626]/80 rounded px-[6px] py-[1px] text-[10px] tracking-normal normal-case font-bold"
              title={`${driftCount} drift event${driftCount === 1 ? '' : 's'} logged`}
            >
              ⚡ {driftCount} drift
            </span>
          )}
        </div>
        <div className="text-sm font-bold truncate">{label}</div>
      </div>
      <span className="text-lg font-extrabold tabular-nums">{fmt(elapsed)}</span>
      <button
        onClick={onExpand}
        className="bg-white/20 hover:bg-white/30 border-0 rounded-lg px-3 py-[6px] text-xs font-bold text-white cursor-pointer"
        title="Open full-screen focus view"
        aria-label="Open full-screen focus view"
      >
        ↗ Focus
      </button>
      <button
        onClick={onPause}
        className="bg-white/20 hover:bg-white/30 border-0 rounded-lg px-3 py-[6px] text-xs font-bold text-white cursor-pointer"
        title="Pause timer"
      >
        ⏸ Pause
      </button>
      <button
        onClick={onStop}
        className="bg-white/20 hover:bg-white/30 border-0 rounded-lg px-3 py-[6px] text-xs font-bold text-white cursor-pointer"
        title="Stop timer and save session"
      >
        ⏹ Stop
      </button>
    </div>
  );
}

function labelForMode(mode: TrackedSession['mode']): string {
  switch (mode) {
    case 'call_focus':
      return 'Call focus';
    case 'app_focus':
      return 'App focus';
    case 'strict':
      return 'Strict zone';
    case 'pomodoro_25_5':
      return 'Pomodoro 25/5';
    case 'pomodoro_50_10':
      return 'Pomodoro 50/10';
    default:
      return 'Open';
  }
}
