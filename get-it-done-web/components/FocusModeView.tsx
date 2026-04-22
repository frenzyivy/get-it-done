'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { useLiveTimers } from '@/lib/useLiveTimer';
import type { FocusMode } from '@/types';
import { BreakingOutModal } from './BreakingOutModal';

// New-spec-1 Feature 5 — dedicated deep-work surface.
// Mounts at the root when `focusSessionId` is set in the store. Renders on top
// of everything via a full-viewport overlay AND requests the browser
// Fullscreen API for App Focus / Strict modes. Detects tab/app switching in
// those modes via `visibilitychange`, logging drift events to the session.

const MODES: { id: FocusMode; label: string; sub: string }[] = [
  { id: 'open', label: 'Open', sub: 'No restrictions' },
  { id: 'call_focus', label: 'Call focus', sub: 'App sounds muted' },
  { id: 'app_focus', label: 'App focus', sub: 'Tab switching logged as drift' },
  { id: 'strict', label: 'Strict zone', sub: 'Muted + drift + confirm to exit' },
];

export function FocusModeView() {
  const focusSessionId = useStore((s) => s.focusSessionId);
  const activeSessions = useStore((s) => s.activeSessions);
  const tasks = useStore((s) => s.tasks);
  const prefs = useStore((s) => s.prefs);
  const stopSession = useStore((s) => s.stopSession);
  const pauseSession = useStore((s) => s.pauseSession);
  const updateSessionMode = useStore((s) => s.updateSessionMode);
  const appendDriftEvent = useStore((s) => s.appendDriftEvent);
  const closeFocusMode = useStore((s) => s.closeFocusMode);
  const openFocusMode = useStore((s) => s.openFocusMode);
  const completeSession = useStore((s) => s.completeSession);
  const markSessionBroken = useStore((s) => s.markSessionBroken);
  const profileV2 = useStore((s) => s.profileV2);

  const elapsedMap = useLiveTimers();

  const session = useMemo(
    () => activeSessions.find((s) => s.id === focusSessionId) ?? null,
    [activeSessions, focusSessionId],
  );

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const driftStartRef = useRef<number | null>(null);
  const [postDrift, setPostDrift] = useState<{ durationSeconds: number } | null>(
    null,
  );
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [breakingOut, setBreakingOut] = useState(false);

  const task = session ? tasks.find((t) => t.id === session.task_id) ?? null : null;
  const subtask = session && task
    ? task.subtasks.find((x) => x.id === session.subtask_id) ?? null
    : null;

  const isGatedMode =
    session?.mode === 'app_focus' || session?.mode === 'strict';

  // --- Fullscreen API -------------------------------------------------------
  useEffect(() => {
    if (!session) return;
    if (!isGatedMode) return;
    const el = overlayRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) return;
    el.requestFullscreen?.().catch(() => {
      // Older Safari or permission blocked — degrade gracefully; the overlay
      // already covers the viewport and visibility detection still works.
    });
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => undefined);
      }
    };
  }, [session, isGatedMode]);

  // --- Drift detection ------------------------------------------------------
  useEffect(() => {
    if (!session || !isGatedMode) return;
    const onVis = () => {
      if (document.hidden) {
        driftStartRef.current = Date.now();
      } else if (driftStartRef.current) {
        const startMs = driftStartRef.current;
        const endMs = Date.now();
        const dur = Math.max(0, Math.floor((endMs - startMs) / 1000));
        driftStartRef.current = null;
        if (dur > 0) {
          void appendDriftEvent(session.id, {
            started_at: new Date(startMs).toISOString(),
            ended_at: new Date(endMs).toISOString(),
            duration_seconds: dur,
          });
          setPostDrift({ durationSeconds: dur });
          window.setTimeout(() => setPostDrift(null), 5000);
        }
      }
    };
    const onBlur = () => {
      if (driftStartRef.current == null) driftStartRef.current = Date.now();
    };
    const onFocus = () => onVis();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [session, isGatedMode, appendDriftEvent]);

  // --- Voice cue on mode change --------------------------------------------
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session) return;
    if (!prefs?.announce_focus_sessions) return;
    if (session.mode === 'open') return;
    const key = `${session.id}:${session.mode}`;
    if (announcedRef.current === key) return;
    announcedRef.current = key;
    const phrase = prefs.focus_announce_phrase || 'You have a meeting';
    try {
      const u = new SpeechSynthesisUtterance(phrase);
      u.rate = 1;
      u.volume = 0.9;
      window.speechSynthesis?.speak(u);
    } catch {
      // TTS not available — silent fallback.
    }
  }, [session, prefs?.announce_focus_sessions, prefs?.focus_announce_phrase]);

  const handleMinimize = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => undefined);
    }
    closeFocusMode();
  }, [closeFocusMode]);

  const handleStop = useCallback(async () => {
    if (!session) return;
    const elapsedSecs =
      (Date.now() - new Date(session.started_at).getTime()) / 1000;
    const planned = session.planned_duration_seconds;
    // Strict + planned block still running → gate on BreakingOutModal. The
    // write (broken=true + reason) lives inside the modal's onConfirm.
    if (session.mode === 'strict' && planned != null && elapsedSecs < planned) {
      setBreakingOut(true);
      return;
    }
    // Planned block reached zero — count it toward the streak.
    if (planned != null && elapsedSecs >= planned) {
      await completeSession(session.id);
    } else {
      await stopSession(session.id);
    }
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => undefined);
    }
  }, [session, stopSession, completeSession]);

  const handlePause = useCallback(async () => {
    if (!session) return;
    setPaused(true);
    await pauseSession(session.id);
  }, [session, pauseSession]);

  // Esc: Strict + still in planned block → BreakingOutModal; else minimize.
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (session.mode === 'strict') {
        const elapsedSecs =
          (Date.now() - new Date(session.started_at).getTime()) / 1000;
        const planned = session.planned_duration_seconds;
        if (planned != null && elapsedSecs < planned) {
          e.preventDefault();
          setBreakingOut(true);
          return;
        }
      }
      handleMinimize();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, handleMinimize]);

  if (!session) return null;

  const elapsed = elapsedMap[session.id] ?? 0;
  const displayTime = fmt(elapsed);
  const otherActive = activeSessions.filter((s) => s.id !== session.id);

  return (
    <>
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between py-10 px-6"
      style={{
        background:
          session.mode === 'strict'
            ? 'linear-gradient(160deg, #1a1a2e 0%, #3b0764 100%)'
            : session.mode === 'app_focus'
              ? 'linear-gradient(160deg, #1e1b4b 0%, #4c1d95 100%)'
              : session.mode === 'call_focus'
                ? 'linear-gradient(160deg, #111827 0%, #312e81 100%)'
                : 'linear-gradient(160deg, #0f172a 0%, #1e293b 100%)',
        color: '#fff',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
    >
      {/* Top — task / subtask pill, switchable between active timers */}
      <div className="flex flex-col items-center gap-2 w-full">
        <button
          onClick={() => {
            if (otherActive.length === 0) return;
            // Cycle to the next concurrent timer.
            const idx = activeSessions.findIndex((s) => s.id === session.id);
            const next = activeSessions[(idx + 1) % activeSessions.length];
            openFocusMode(next.id);
          }}
          className="bg-white/10 hover:bg-white/15 border-0 rounded-full px-5 py-[10px] text-[13px] font-bold text-white cursor-pointer max-w-[90%] truncate"
          title={
            otherActive.length > 0
              ? 'Tap to switch between active timers'
              : 'Current task'
          }
        >
          {task?.title ?? 'Tracking…'}
          {subtask && <span className="opacity-80"> → {subtask.title}</span>}
          {otherActive.length > 0 && (
            <span className="ml-2 text-[11px] opacity-70">
              ({otherActive.length + 1} running — tap to switch)
            </span>
          )}
        </button>
        {postDrift && (
          <div className="bg-[#dc2626] text-white text-[11px] font-bold rounded-full px-3 py-[4px] animate-[fadeIn_0.2s_ease-out]">
            ⚡ You drifted for {postDrift.durationSeconds}s — logged.
          </div>
        )}
      </div>

      {/* Middle — big time + 3 controls */}
      <div className="flex flex-col items-center gap-8">
        <div className="text-[96px] leading-[1] font-extrabold tabular-nums tracking-[-4px]">
          {displayTime}
        </div>
        <div className="flex items-center gap-6">
          <ControlButton
            icon="⏸"
            label="Pause"
            onClick={handlePause}
            disabled={paused}
          />
          <ControlButton
            icon="▶"
            label={paused ? 'Resume' : 'Running'}
            onClick={() => {
              // Paused resume requires restarting — hand back to task card.
              handleMinimize();
            }}
            disabled={!paused}
          />
          <ControlButton icon="⏹" label="Stop" onClick={handleStop} danger />
        </div>
      </div>

      {/* Bottom — mode selector + minimize */}
      <div className="flex flex-col items-center gap-3 w-full">
        <div className="relative">
          <button
            onClick={() => setModePickerOpen((v) => !v)}
            className="bg-white/10 hover:bg-white/15 border-0 rounded-full px-5 py-[10px] text-[13px] font-bold text-white cursor-pointer"
          >
            Mode of Timer · {labelForMode(session.mode)} ▾
          </button>
          {modePickerOpen && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-xl overflow-hidden min-w-[240px]">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setModePickerOpen(false);
                    void updateSessionMode(session.id, m.id);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-black/[.04] bg-transparent border-0 cursor-pointer block"
                  style={{
                    background:
                      session.mode === m.id ? 'rgba(139,92,246,0.12)' : undefined,
                  }}
                >
                  <div className="text-[13px] font-bold text-[#1a1a2e]">
                    {m.label}
                  </div>
                  <div className="text-[11px] text-[#666]">{m.sub}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleMinimize}
          className="text-[12px] font-bold text-white/70 hover:text-white bg-transparent border-0 cursor-pointer underline underline-offset-4"
        >
          Minimize (timer keeps running)
        </button>
      </div>
    </div>
    <BreakingOutModal
      visible={breakingOut}
      elapsedSeconds={elapsed}
      plannedSeconds={session.planned_duration_seconds}
      streak={profileV2?.current_streak ?? 0}
      onCancel={() => setBreakingOut(false)}
      onConfirm={async (reason) => {
        await markSessionBroken(session.id, reason);
        setBreakingOut(false);
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => undefined);
        }
      }}
    />
    </>
  );
}

function ControlButton({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-[72px] h-[72px] rounded-full border-0 flex flex-col items-center justify-center text-white cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: danger ? '#dc2626' : 'rgba(255,255,255,0.14)',
      }}
      title={label}
      aria-label={label}
    >
      <span className="text-[28px] leading-none">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.5px] opacity-80 mt-[2px]">
        {label}
      </span>
    </button>
  );
}

function labelForMode(mode: FocusMode | string): string {
  switch (mode) {
    case 'call_focus':
      return 'Call focus';
    case 'app_focus':
      return 'App focus';
    case 'strict':
      return 'Strict zone';
    case 'open':
      return 'Open';
    default:
      return mode;
  }
}
