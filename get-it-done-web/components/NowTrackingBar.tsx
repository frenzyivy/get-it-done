'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { fmt, fmtShort } from '@/lib/utils';
import { useLiveBreaks, useLiveTimers } from '@/lib/useLiveTimer';
import type { Priority, TrackedSession } from '@/types';

// New-spec-1 Feature 4 — the banner now renders a stack of active timers, one
// card per live session, each with its own break/stop + full-screen shortcut.
// Feature 5 — every row has a "↗" button that opens the focus-mode fullscreen
// for that specific timer.
// Feature 05 (break-timer) — the Pause button is replaced by Break: it freezes
// tracked time on the current session row instead of ending it. While on
// break, the panel shifts to amber and a "Break: MM:SS · not counted" line
// appears under the meta row.
export function NowTrackingBar() {
  const activeSessions = useStore((s) => s.activeSessions);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
  const stopSession = useStore((s) => s.stopSession);
  const startBreak = useStore((s) => s.startBreak);
  const endBreak = useStore((s) => s.endBreak);
  const openFocusMode = useStore((s) => s.openFocusMode);
  const lastStopSummary = useStore((s) => s.lastStopSummary);
  const clearStopSummary = useStore((s) => s.clearStopSummary);

  const elapsedMap = useLiveTimers();
  const breakMap = useLiveBreaks();

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
          const brk = breakMap[sess.id] ?? {
            breakAccrued: 0,
            isOnBreak: false,
          };
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
              breakAccrued={brk.breakAccrued}
              isOnBreak={brk.isOnBreak}
              taskTitle={task?.title ?? 'Tracking…'}
              subtaskTitle={subtask?.title ?? null}
              projectName={proj?.name ?? null}
              categoryName={cat?.name ?? null}
              priority={task?.priority ?? null}
              onBreak={() => void startBreak(sess.id)}
              onResume={() => void endBreak(sess.id)}
              onStop={() => stopSession(sess.id)}
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

// Two gradients with the same sheen-sweep cutout at 50% — navy in the active
// state, amber-900 → amber-800 on break. Sheen animation rides on top of both.
const NAVY_GRADIENT =
  'linear-gradient(110deg, #1a1a2e 0%, #1a1a2e 40%, rgba(255,255,255,0.06) 50%, #1a1a2e 60%, #1a1a2e 100%)';
const AMBER_GRADIENT =
  'linear-gradient(110deg, #78350f 0%, #92400e 40%, rgba(255,255,255,0.08) 50%, #92400e 60%, #78350f 100%)';

function TrackingRow({
  session,
  elapsed,
  breakAccrued,
  isOnBreak,
  taskTitle,
  subtaskTitle,
  projectName,
  categoryName,
  priority,
  onBreak,
  onResume,
  onStop,
  onExpand,
}: {
  session: TrackedSession;
  elapsed: number;
  breakAccrued: number;
  isOnBreak: boolean;
  taskTitle: string;
  subtaskTitle: string | null;
  projectName: string | null;
  categoryName: string | null;
  priority: Priority | null;
  onBreak: () => void;
  onResume: () => void;
  onStop: () => Promise<void>;
  onExpand: () => void;
}) {
  // Feature 2a — show "{Task} → {Subtask}" whenever a subtask timer is active.
  const label = subtaskTitle ? `${taskTitle} → ${subtaskTitle}` : taskTitle;
  const driftCount = session.drift_events?.length ?? 0;

  // Feature 03 — Stop is manual-only and gated behind a confirm. Local per-row
  // state so concurrent timers don't share a confirm flag. On DB error the
  // throw bypasses stopSession's optimistic remove, so the row stays mounted
  // and the timer keeps ticking; we only need to surface a toast.
  const [confirming, setConfirming] = useState(false);

  // Spec § Now Tracking — meta line `project · CATEGORY · PRIORITY`. Each
  // segment skipped if its data is null. Project keeps its case; category
  // and priority go uppercase per the design system rule (mono caps for
  // static labels). Joined with mono middots.
  const metaSegments: string[] = [];
  if (projectName) metaSegments.push(projectName);
  if (categoryName) metaSegments.push(categoryName.toUpperCase());
  if (priority) metaSegments.push(`${priority.toUpperCase()} PRIORITY`);

  // Feature 05 — show the break line whenever the session has any break time
  // (live or accrued). Hidden for fresh sessions to avoid noise.
  const showBreakLine = breakAccrued > 0 || isOnBreak;

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
        className="rounded-[14px] px-5 py-4 grid items-center gap-x-4 relative overflow-hidden transition-[background] duration-300"
        style={{
          gridTemplateColumns: '1fr auto auto',
          background: isOnBreak ? AMBER_GRADIENT : NAVY_GRADIENT,
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
              className="w-[8px] h-[8px] rounded-full shrink-0"
              style={{
                background: isOnBreak ? '#fbbf24' : '#fff',
                animation: 'nowTrackingPulse 1.4s ease-in-out infinite',
              }}
            />
            <span
              className="text-[10px] font-mono uppercase tracking-[1.5px] font-bold"
              style={{ color: isOnBreak ? '#fef3c7' : 'rgba(255,255,255,0.85)' }}
            >
              {isOnBreak ? 'On break · paused' : 'Now tracking'}
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
            <div
              className="text-[10px] font-mono tracking-wider mt-[2px] truncate"
              style={{
                color: isOnBreak ? 'rgba(254,243,199,0.65)' : 'rgba(255,255,255,0.55)',
              }}
            >
              {metaSegments.join(' · ')}
            </div>
          )}
          {showBreakLine && (
            <div
              className="text-[10px] font-mono tracking-wider mt-[2px] truncate"
              style={{ color: 'rgba(253,230,138,0.85)' }}
              aria-live="polite"
            >
              Break: {fmt(breakAccrued)} · not counted
            </div>
          )}
        </div>

        {/* Middle column — big monospace timer. Frozen while on break. */}
        <div className="text-[32px] font-mono font-extrabold tabular-nums leading-none">
          {fmt(elapsed)}
        </div>

        {/* Right column — Focus / Break|Resume / Stop pill stack. Confirm-on-
            Stop (Feature 03): Stop swaps the action pills for a Confirm/Cancel
            pair so a stray click can't kill a long session. */}
        <div className="flex flex-col gap-1">
          <button
            onClick={onExpand}
            className="bg-white text-[#1a1a2e] border-0 rounded-full px-3 py-[5px] text-[11px] font-extrabold cursor-pointer hover:bg-white/90 transition-colors"
            title="Open full-screen focus view"
            aria-label="Open full-screen focus view"
          >
            ↗ Focus
          </button>
          {!confirming ? (
            <>
              {!isOnBreak ? (
                <button
                  onClick={onBreak}
                  className="bg-white/12 hover:bg-white/20 border-0 rounded-full px-3 py-[5px] text-[11px] font-bold text-white cursor-pointer transition-colors"
                  title="Take a break — tracked time freezes; break time is logged separately"
                >
                  ⏸ Break
                </button>
              ) : (
                <button
                  onClick={onResume}
                  className="bg-[#f59e0b] hover:bg-[#d97706] border-0 rounded-full px-3 py-[5px] text-[11px] font-extrabold text-white cursor-pointer transition-colors"
                  title="Resume tracking"
                >
                  ▶ Resume
                </button>
              )}
              <button
                onClick={() => setConfirming(true)}
                className="bg-transparent hover:bg-white/10 border border-white/20 rounded-full px-3 py-[5px] text-[11px] font-bold text-white cursor-pointer transition-colors"
                title="Stop timer and save session"
              >
                ⏹ Stop
              </button>
            </>
          ) : (
            <>
              <div
                role="alert"
                className="text-[10px] font-mono uppercase tracking-wider text-white/85 px-1 pt-1 leading-tight"
              >
                Stop tracking this task?
              </div>
              <div className="text-[9px] font-mono text-white/55 px-1 pb-1 leading-tight">
                Manual stop only — no auto-stop.
              </div>
              <button
                onClick={async () => {
                  setConfirming(false);
                  try {
                    await onStop();
                  } catch {
                    useStore
                      .getState()
                      .showToast('Could not stop timer — please retry.');
                  }
                }}
                className="bg-[#dc2626] hover:bg-[#b91c1c] border-0 rounded-full px-3 py-[5px] text-[11px] font-extrabold text-white cursor-pointer transition-colors"
                title="Confirm stop and save session"
              >
                Confirm stop
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="bg-white/12 hover:bg-white/20 border-0 rounded-full px-3 py-[5px] text-[11px] font-bold text-white cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </>
          )}
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
