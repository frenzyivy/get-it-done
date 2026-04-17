import { useEffect, useState } from 'react';
import { useStore } from './store';

// Mirror of the web hook. Identical logic — ticks once a second, persists to
// the DB every 30s so a crash mid-session doesn't lose progress.
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
