'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { fmt, fmtShort } from '@/lib/utils';
import { useLiveTimers } from '@/lib/useLiveTimer';
import type { Priority, TrackedSession } from '@/types';

// New-spec-1 Feature 4 — the banner now renders a stack of active timers, one
// card per live session, each with its own pause/stop + full-screen shortcut.
// Feature 5 — every row has a "↗" button that opens the focus-mode fullscreen
// for that specific timer.
export function NowTrackingBar() {
  const activeSessions = useStore((s) => s.activeSessions);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
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
              background: warn ? '#fde68a' : 'rgba(0,0,0,0.08)',
              color: warn ? '#92400e' : '#1a1a2e',
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
          // Spec § Now Tracking — meta line "project · CATEGORY · PRIORITY".
          // First project + first category if multiple. Priority is always
          // single-valued.
          const proj = task?.project_ids[0]
            ? projects.find((p) => p.id === task.project_ids[0])
            : null;
          const cat = task?.category_ids[0]
            ? categories.find((c) => c.id === task.category_ids[0])
            : null;
          return (
            <TrackingRow
              key={sess.id}
              session={sess}
              elapsed={elapsed}
              taskTitle={task?.title ?? 'Tracking…'}
              subtaskTitle={subtask?.title ?? null}
              projectName={proj?.name ?? null}
              categoryName={cat?.name ?? null}
              priority={task?.priority ?? null}
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
  projectName,
  categoryName,
  priority,
  onPause,
  onStop,
  onExpand,
}: {
  session: TrackedSession;
  elapsed: number;
  taskTitle: string;
  subtaskTitle: string | null;
  projectName: string | null;
  categoryName: string | null;
  priority: Priority | null;
  onPause: () => void;
  onStop: () => void;
  onExpand: () => void;
}) {
  // Feature 2a — show "{Task} → {Subtask}" whenever a subtask timer is active.
  const label = subtaskTitle ? `${taskTitle} → ${subtaskTitle}` : taskTitle;
  const driftCount = session.drift_events?.length ?? 0;

  // Spec § Now Tracking — meta line `project · CATEGORY · PRIORITY`. Each
  // segment skipped if its data is null. Project keeps its case; category
  // and priority go uppercase per the design system rule (mono caps for
  // static labels). Joined with mono middots.
  const metaSegments: string[] = [];
  if (projectName) metaSegments.push(projectName);
  if (categoryName) metaSegments.push(categoryName.toUpperCase());
  if (priority) metaSegments.push(`${priority.toUpperCase()} PRIORITY`);

  return (
    <>
      <style>{`
        @keyframes nowTrackingSheen {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes nowTrackingPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
      <div
        className="rounded-[14px] px-5 py-4 grid items-center gap-x-4 relative overflow-hidden"
        style={{
          gridTemplateColumns: '1fr auto auto',
          background:
            'linear-gradient(110deg, #1a1a2e 0%, #1a1a2e 40%, rgba(255,255,255,0.06) 50%, #1a1a2e 60%, #1a1a2e 100%)',
          backgroundSize: '200% 100%',
          color: '#fff',
          animation: 'nowTrackingSheen 4s linear infinite',
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        }}
      >
        {/* Left column — label, task name, meta line */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="w-[8px] h-[8px] rounded-full bg-white shrink-0"
              style={{ animation: 'nowTrackingPulse 1.4s ease-in-out infinite' }}
            />
            <span className="text-[10px] font-mono uppercase tracking-[1.5px] font-bold text-white/85">
              Now tracking
            </span>
            {session.mode !== 'open' && session.mode !== 'free' && (
              <span className="bg-white/15 rounded px-[6px] py-[1px] text-[9px] uppercase tracking-wider font-bold">
                {labelForMode(session.mode)}
              </span>
            )}
            {driftCount > 0 && (
              <span
                className="bg-[#dc2626]/80 rounded px-[6px] py-[1px] text-[9px] uppercase tracking-wider font-bold"
                title={`${driftCount} drift event${driftCount === 1 ? '' : 's'} logged`}
              >
                ⚡ {driftCount} drift
              </span>
            )}
          </div>
          <div className="text-[15px] font-semibold truncate mt-[2px]">
            {label}
          </div>
          {metaSegments.length > 0 && (
            <div className="text-[10px] font-mono tracking-wider text-white/55 mt-[2px] truncate">
              {metaSegments.join(' · ')}
            </div>
          )}
        </div>

        {/* Middle column — big monospace timer */}
        <div className="text-[32px] font-mono font-extrabold tabular-nums leading-none">
          {fmt(elapsed)}
        </div>

        {/* Right column — Focus / Pause / Stop pill stack */}
        <div className="flex flex-col gap-1">
          <button
            onClick={onExpand}
            className="bg-white text-[#1a1a2e] border-0 rounded-full px-3 py-[5px] text-[11px] font-extrabold cursor-pointer hover:bg-white/90 transition-colors"
            title="Open full-screen focus view"
            aria-label="Open full-screen focus view"
          >
            ↗ Focus
          </button>
          <button
            onClick={onPause}
            className="bg-white/12 hover:bg-white/20 border-0 rounded-full px-3 py-[5px] text-[11px] font-bold text-white cursor-pointer transition-colors"
            title="Pause timer"
          >
            ⏸ Pause
          </button>
          <button
            onClick={onStop}
            className="bg-transparent hover:bg-white/10 border border-white/20 rounded-full px-3 py-[5px] text-[11px] font-bold text-white cursor-pointer transition-colors"
            title="Stop timer and save session"
          >
            ⏹ Stop
          </button>
        </div>
      </div>
    </>
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
