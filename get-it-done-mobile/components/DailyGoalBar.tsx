import { Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import { fmtShort, isToday } from '@/lib/utils';
import { ProgressBar } from './ProgressBar';

export function DailyGoalBar() {
  const tasks = useStore((s) => s.tasks);
  const profile = useStore((s) => s.profileV2);

  const goal = profile?.daily_task_goal ?? 3;
  const streak = profile?.current_streak ?? 0;

  const completedToday = tasks.filter(
    (t) =>
      t.status === 'done' &&
      isToday(t.sessions[t.sessions.length - 1]?.started_at),
  ).length;

  const sessions = tasks.flatMap((t) => t.sessions);
  const focusTodaySeconds = sessions
    .filter((s) => isToday(s.started_at))
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);

  const pct = Math.min(100, Math.round((completedToday / goal) * 100));
  const met = completedToday >= goal;

  return (
    <View
      style={{
        backgroundColor: met ? '#d1fae5' : '#ede9fe',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1.5,
        borderColor: met ? '#10b981' : 'rgba(139,92,246,0.25)',
        marginHorizontal: 16,
        marginBottom: 8,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '800',
              color: '#1a1a2e',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Today&apos;s goal
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: met ? '#10b981' : '#8b5cf6',
            }}
          >
            {met ? '✓ ' : ''}
            {completedToday} / {goal} tasks
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#555' }}>
            🔥 {streak}
          </Text>
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#555' }}>
            🕐 {fmtShort(focusTodaySeconds)}
          </Text>
        </View>
      </View>
      <ProgressBar value={pct} height={6} accent={met ? '#10b981' : '#8b5cf6'} />
    </View>
  );
}
