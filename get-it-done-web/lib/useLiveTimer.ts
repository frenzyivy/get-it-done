import { useEffect, useState } from 'react';
import { useStore } from './store';

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
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (sessions.length === 0) return;
    const tickId = setInterval(() => setTick((t) => t + 1), 1000);
    const persistId = setInterval(() => void persist(), 30_000);
    return () => {
      clearInterval(tickId);
      clearInterval(persistId);
    };
  }, [sessions.length, persist]);

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
