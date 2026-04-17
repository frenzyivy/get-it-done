import { Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import { fmt } from '@/lib/utils';

export function StickyTimerBar() {
  const runningTimer = useStore((s) => s.runningTimer);
  const task = useStore((s) =>
    runningTimer ? s.tasks.find((t) => t.id === runningTimer.taskId) : null,
  );
  if (!runningTimer || !task) return null;

  return (
    <View
      style={{
        backgroundColor: '#8b5cf6',
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#fca5a5',
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
          {task.title}
        </Text>
        <Text
          style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}
          numberOfLines={1}
        >
          ▸ {runningTimer.label}
        </Text>
      </View>
      <Text
        style={{
          color: '#fff',
          fontSize: 18,
          fontWeight: '800',
          fontVariant: ['tabular-nums'],
        }}
      >
        {fmt(runningTimer.elapsed)}
      </Text>
    </View>
  );
}
