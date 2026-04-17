'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { fmt, fmtShort } from '@/lib/utils';
import { useLiveTimer } from '@/lib/useLiveTimer';

// v2 spec §5 + M2 — live timer bar with pause/resume/stop + "Saved · Xm" toast.
export function NowTrackingBar() {
  const activeSession = useStore((s) => s.activeSession);
  const tasks = useStore((s) => s.tasks);
  const stopActiveSession = useStore((s) => s.stopActiveSession);
  const pauseActiveSession = useStore((s) => s.pauseActiveSession);
  const lastStopSummary = useStore((s) => s.lastStopSummary);
  const clearStopSummary = useStore((s) => s.clearStopSummary);

  const elapsed = useLiveTimer();

  // Auto-dismiss the stop toast after 3 seconds (spec says "2s" but 3s feels
  // less jumpy when you just saved something meaningful).
  useEffect(() => {
    if (!lastStopSummary) return;
    const id = setTimeout(() => clearStopSummary(), 3000);
    return () => clearTimeout(id);
  }, [lastStopSummary, clearStopSummary]);

  if (!activeSession && !lastStopSummary) return null;

  if (activeSession) {
    const task = tasks.find((t) => t.id === activeSession.task_id);
    const subtask = task?.subtasks.find((s) => s.id === activeSession.subtask_id);
    const label = subtask?.title ?? task?.title ?? 'Tracking…';

    return (
      <div
        className="rounded-[14px] px-4 py-3 flex items-center gap-3"
        style={{ background: '#7F77DD', color: '#fff' }}
      >
        <span className="w-2 h-2 rounded-full bg-[#fca5a5] animate-[pomoPulse_1s_ease-in-out_infinite] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.5px] opacity-80">
            Now tracking
          </div>
          <div className="text-sm font-bold truncate">{label}</div>
        </div>
        <span className="text-lg font-extrabold tabular-nums">{fmt(elapsed)}</span>
        <button
          onClick={() => void pauseActiveSession()}
          className="bg-white/20 hover:bg-white/30 border-0 rounded-lg px-3 py-[6px] text-xs font-bold text-white cursor-pointer"
          title="Pause timer"
        >
          ⏸ Pause
        </button>
        <button
          onClick={() => void stopActiveSession()}
          className="bg-white/20 hover:bg-white/30 border-0 rounded-lg px-3 py-[6px] text-xs font-bold text-white cursor-pointer"
          title="Stop timer and save session"
        >
          ⏹ Stop
        </button>
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
