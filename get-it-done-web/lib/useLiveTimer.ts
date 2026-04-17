import { useEffect, useState } from 'react';
import { useStore } from './store';

// v2 M2 — single source of elapsed seconds + 30s DB persist.
// Returns the current elapsed in seconds (0 when no active session). Meant to
// be called at root layout level so persist fires regardless of view.
export function useLiveTimer(): number {
  const activeSession = useStore((s) => s.activeSession);
  const persist = useStore((s) => s.persistActiveSessionDuration);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeSession) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      const start = new Date(activeSession.started_at).getTime();
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const tickId = setInterval(tick, 1000);
    const persistId = setInterval(() => void persist(), 30_000);
    return () => {
      clearInterval(tickId);
      clearInterval(persistId);
    };
  }, [activeSession, persist]);

  return elapsed;
}
