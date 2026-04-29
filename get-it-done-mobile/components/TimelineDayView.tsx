import { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { TimelineGantt } from './TimelineGantt';
import type { TrackedSession } from '@/types';

const DAY_MS = 24 * 3600 * 1000;

export function TimelineDayView() {
  const userId = useStore((s) => s.userId);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);

  const dayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const dayEnd = useMemo(() => new Date(dayStart.getTime() + DAY_MS), [dayStart]);

  useEffect(() => {
    if (!userId) return;
    void fetchPlannedBlocks(dayStart.toISOString(), dayEnd.toISOString());
  }, [userId, fetchPlannedBlocks, dayStart, dayEnd]);

  const [sessions, setSessions] = useState<TrackedSession[]>([]);
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const { data } = await supabase
        .from('tracked_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', dayStart.toISOString())
        .lt('started_at', dayEnd.toISOString())
        .order('started_at', { ascending: true });
      setSessions((data ?? []) as TrackedSession[]);
    })();
  }, [userId, dayStart, dayEnd]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      <TimelineGantt
        dayStart={dayStart}
        plannedBlocks={plannedBlocks}
        sessions={sessions}
      />
    </ScrollView>
  );
}
