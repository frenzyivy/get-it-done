import { useEffect, useState } from 'react';
import { useStore } from './store';

// New-spec-1 Feature 4 — multi-timer support. Returns a map of sessionId →
// elapsed seconds. Ticks once per second. Persists every 30s.
export function useLiveTimers(): Record<string, number> {
  const sessions = useStore((s) => s.activeSessions);
  const persist = useStore((s) => s.persistActiveSessionDurations);
  const [, setTick] = useState(0);

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
  }
  return out;
}

export function useSessionElapsed(sessionId: string | null | undefined): number {
  const map = useLiveTimers();
  return sessionId ? map[sessionId] ?? 0 : 0;
}

// Back-compat: returns the elapsed of the most-recent active session.
export function useLiveTimer(): number {
  const sessions = useStore((s) => s.activeSessions);
  const map = useLiveTimers();
  if (sessions.length === 0) return 0;
  const latest = sessions[sessions.length - 1];
  return map[latest.id] ?? 0;
}
