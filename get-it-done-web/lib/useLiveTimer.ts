import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';

// Idle threshold for auto-pause. If the user hasn't touched the app in this
// many ms, any running timer is auto-paused at the last-activity timestamp.
const IDLE_THRESHOLD_MS = 10 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 60 * 1000;

// New-spec-1 Feature 4 — multiple timers can run at once. This hook returns a
// map of sessionId → elapsed seconds, ticking once per second. It also persists
// every active session's duration to the DB every 30s so a browser crash
// doesn't lose progress.
//
// Meant to be mounted once at layout level. Components that only need the
// elapsed for a single session should use `useSessionElapsed(sessionId)`.
export function useLiveTimers(): Record<string, number> {
  const sessions = useStore((s) => s.activeSessions);
  const persist = useStore((s) => s.persistActiveSessionDurations);
  const autoPauseIdle = useStore((s) => s.autoPauseIdleSessions);
  const [tick, setTick] = useState(0);
  const lastActivityRef = useRef<number>(Date.now());

  // Track real user activity. Any of these resets the idle clock. We listen
  // on window so every page/view benefits without wiring per-component.
  useEffect(() => {
    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;
    for (const ev of events) window.addEventListener(ev, bump, { passive: true });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') bump();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      for (const ev of events) window.removeEventListener(ev, bump);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (sessions.length === 0) return;
    const tickId = setInterval(() => setTick((t) => t + 1), 1000);
    const persistId = setInterval(() => void persist(), 30_000);
    const idleId = setInterval(() => {
      void autoPauseIdle(lastActivityRef.current, IDLE_THRESHOLD_MS);
    }, IDLE_CHECK_INTERVAL_MS);
    return () => {
      clearInterval(tickId);
      clearInterval(persistId);
      clearInterval(idleId);
    };
  }, [sessions.length, persist, autoPauseIdle]);

  const out: Record<string, number> = {};
  for (const s of sessions) {
    const startMs = new Date(s.started_at).getTime();
    out[s.id] = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    void tick; // tie render to ticker
  }
  return out;
}

// Convenience for components that care about one specific session.
export function useSessionElapsed(sessionId: string | null | undefined): number {
  const elapsedMap = useLiveTimers();
  return sessionId ? elapsedMap[sessionId] ?? 0 : 0;
}

// Back-compat shim — returns the elapsed of the most-recent active session, or
// 0 when none. Several components called `useLiveTimer()` under the old
// single-active-session model; they now only use it when they already know a
// session is active for their card/subtask.
export function useLiveTimer(): number {
  const sessions = useStore((s) => s.activeSessions);
  const elapsedMap = useLiveTimers();
  if (sessions.length === 0) return 0;
  // Return the elapsed of the most recently started session.
  const latest = sessions[sessions.length - 1];
  return elapsedMap[latest.id] ?? 0;
}
