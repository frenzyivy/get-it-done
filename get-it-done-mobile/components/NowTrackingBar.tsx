import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import { fmt, fmtShort } from '@/lib/utils';
import { useLiveTimer } from '@/lib/useLiveTimer';

// v2 M2 — live timer bar with pause/resume/stop + "Saved · Xm" toast.
export function NowTrackingBar() {
  const activeSession = useStore((s) => s.activeSession);
  const tasks = useStore((s) => s.tasks);
  const stopActiveSession = useStore((s) => s.stopActiveSession);
  const pauseActiveSession = useStore((s) => s.pauseActiveSession);
  const lastStopSummary = useStore((s) => s.lastStopSummary);
  const clearStopSummary = useStore((s) => s.clearStopSummary);

  const elapsed = useLiveTimer();

  useEffect(() => {
    if (!lastStopSummary) return;
    const id = setTimeout(() => clearStopSummary(), 3000);
    return () => clearTimeout(id);
  }, [lastStopSummary, clearStopSummary]);

  if (!activeSession && !lastStopSummary) return null;

  if (activeSession) {
    const task = tasks.find((t) => t.id === activeSession.task_id);
    const subtask = task?.subtasks.find((s) => s.id === activeSession.subtask_id);
    const label = subtask?.title ?? task?.title ?? 'Tracking…';

    return (
      <View
        style={{
          backgroundColor: '#7F77DD',
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
          <Text
            style={{
              color: '#fff',
              fontSize: 10,
              opacity: 0.85,
              fontWeight: '600',
            }}
            numberOfLines={1}
          >
            NOW TRACKING
          </Text>
          <Text
            style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
        <Text
          style={{
            color: '#fff',
            fontSize: 16,
            fontWeight: '800',
            fontVariant: ['tabular-nums'],
          }}
        >
          {fmt(elapsed)}
        </Text>
        <Pressable
          onPress={() => void pauseActiveSession()}
          style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
            ⏸
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void stopActiveSession()}
          style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
            ⏹
          </Text>
        </Pressable>
      </View>
    );
  }

  // Saved toast
  return (
    <View
      style={{
        backgroundColor: '#10b981',
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 16 }}>✓</Text>
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 }}>
        Saved · {fmtShort(lastStopSummary!.durationSeconds)}
      </Text>
      <Pressable
        onPress={clearStopSummary}
        style={{
          backgroundColor: 'rgba(255,255,255,0.2)',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
          Dismiss
        </Text>
      </Pressable>
    </View>
  );
}
