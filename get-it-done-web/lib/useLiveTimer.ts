import { useEffect, useState } from 'react';
import { useStore } from './store';

// v2 M2 — single source of elapsed seconds + 30s DB persist.
// Returns the current elapsed in seconds (0 when no active session). Meant to
// be called at root layout level so persist fires regardless of view.
export function useLiveTimer(): number {
  const sessionId = useStore((s) => s.activeSession?.id ?? null);
  const startedAt = useStore((s) => s.activeSession?.started_at ?? null);
  const persist = useStore((s) => s.persistActiveSessionDuration);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!sessionId || !startedAt) {
      setElapsed(0);
      return;
    }
    const startMs = new Date(startedAt).getTime();
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    tick();
    const tickId = setInterval(tick, 1000);
    const persistId = setInterval(() => void persist(), 30_000);
    return () => {
      clearInterval(tickId);
      clearInterval(persistId);
    };
  }, [sessionId, startedAt, persist]);

  return elapsed;
}
