import { useEffect, useState } from 'react';
import { useStore } from './store';

// New-spec-1 Feature 4 — multiple timers can run at once. This hook returns a
// map of sessionId → elapsed seconds, ticking once per second. It also persists
// every active session's duration to the DB every 30s so a browser crash
// doesn't lose progress.
//
// Feature 05 — the returned number is *tracked* seconds (net of break time).
// While a session is on break, its tracked value freezes; the live break
// counter is exposed via useLiveBreaks() for components that need to render it.
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
  const now = Date.now();
  for (const s of sessions) {
    const startMs = new Date(s.started_at).getTime();
    const elapsed = Math.max(0, Math.floor((now - startMs) / 1000));
    const liveBreak =
      s.is_on_break && s.last_break_started_at
        ? Math.max(
            0,
            Math.floor((now - new Date(s.last_break_started_at).getTime()) / 1000),
          )
        : 0;
    const breakTotal = (s.break_seconds ?? 0) + liveBreak;
    out[s.id] = Math.max(0, elapsed - breakTotal);
    void tick; // tie render to ticker
  }
  return out;
}

// Feature 05 — break counter per session. Returns total break seconds for the
// current session (closed breaks + live break, if on break) and the on-break
// flag. Components that don't care about breaks can ignore this hook entirely.
export function useLiveBreaks(): Record<
  string,
  { breakAccrued: number; isOnBreak: boolean }
> {
  const sessions = useStore((s) => s.activeSessions);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (sessions.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [sessions.length]);

  const out: Record<string, { breakAccrued: number; isOnBreak: boolean }> = {};
  const now = Date.now();
  for (const s of sessions) {
    const liveBreak =
      s.is_on_break && s.last_break_started_at
        ? Math.max(
            0,
            Math.floor((now - new Date(s.last_break_started_at).getTime()) / 1000),
          )
        : 0;
    out[s.id] = {
      breakAccrued: (s.break_seconds ?? 0) + liveBreak,
      isOnBreak: s.is_on_break,
    };
    void tick;
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
