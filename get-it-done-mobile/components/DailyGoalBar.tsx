import { Pressable, Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import { fmtShort, isToday, todayISO } from '@/lib/utils';
import { useUI } from '@/lib/ui-context';
import { ProgressBar } from './ProgressBar';

// "Today's 5" — tap to open the sheet listing the 5 tasks picked for today.
const DAILY_CAP = 5;

export function DailyGoalBar() {
  const tasks = useStore((s) => s.tasks);
  const profile = useStore((s) => s.profileV2);
  const { openTodayFive } = useUI();

  const today = todayISO();
  const plannedForToday = tasks
    .filter((t) => t.planned_for_date === today)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const todaysFive = plannedForToday.slice(0, DAILY_CAP);
  const completedToday = todaysFive.filter((t) => t.status === 'done').length;

  const streak = profile?.current_streak ?? 0;

  const sessions = tasks.flatMap((t) => t.sessions);
  const focusTodaySeconds = sessions
    .filter((s) => isToday(s.started_at))
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);

  const pct = Math.min(100, Math.round((completedToday / DAILY_CAP) * 100));
  const met = completedToday >= DAILY_CAP;

  return (
    <Pressable
      onPress={openTodayFive}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '800',
              color: '#1a1a2e',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Today&apos;s 5
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: met ? '#10b981' : '#8b5cf6',
            }}
          >
            {met ? '✓ ' : ''}
            {completedToday} / {DAILY_CAP} tasks
          </Text>
          {plannedForToday.length > DAILY_CAP && (
            <View
              style={{
                backgroundColor: 'rgba(0,0,0,0.06)',
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 6,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#666' }}>
                +{plannedForToday.length - DAILY_CAP} queued
              </Text>
            </View>
          )}
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
    </Pressable>
  );
}
