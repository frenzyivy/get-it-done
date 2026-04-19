import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import { fmt, fmtShort } from '@/lib/utils';
import { useLiveTimers } from '@/lib/useLiveTimer';
import type { TrackedSession } from '@/types';

// New-spec-1 Feature 4 — stackable timer bar. On mobile, 2+ timers collapse
// to a single-line summary by default; tapping expands the stack.
export function NowTrackingBar() {
  const activeSessions = useStore((s) => s.activeSessions);
  const tasks = useStore((s) => s.tasks);
  const stopSession = useStore((s) => s.stopSession);
  const pauseSession = useStore((s) => s.pauseSession);
  const openFocusMode = useStore((s) => s.openFocusMode);
  const lastStopSummary = useStore((s) => s.lastStopSummary);
  const clearStopSummary = useStore((s) => s.clearStopSummary);

  const elapsedMap = useLiveTimers();

  useEffect(() => {
    if (!lastStopSummary) return;
    const id = setTimeout(() => clearStopSummary(), 3000);
    return () => clearTimeout(id);
  }, [lastStopSummary, clearStopSummary]);

  if (activeSessions.length === 0 && !lastStopSummary) return null;

  if (activeSessions.length > 0) {
    return (
      <View style={{ gap: 6 }}>
        {activeSessions.map((sess) => {
          const task = tasks.find((t) => t.id === sess.task_id);
          const subtask = task?.subtasks.find((s) => s.id === sess.subtask_id);
          return (
            <TrackingRow
              key={sess.id}
              session={sess}
              elapsed={elapsedMap[sess.id] ?? 0}
              taskTitle={task?.title ?? 'Tracking…'}
              subtaskTitle={subtask?.title ?? null}
              onPause={() => void pauseSession(sess.id)}
              onStop={() => void stopSession(sess.id)}
              onExpand={() => openFocusMode(sess.id)}
            />
          );
        })}
        {activeSessions.length >= 3 && (
          <View
            style={{
              backgroundColor: '#fde68a',
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: '#92400e', fontSize: 11, fontWeight: '700' }}>
              ⚠ {activeSessions.length} timers running concurrently
            </Text>
          </View>
        )}
      </View>
    );
  }

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
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

function TrackingRow({
  session,
  elapsed,
  taskTitle,
  subtaskTitle,
  onPause,
  onStop,
  onExpand,
}: {
  session: TrackedSession;
  elapsed: number;
  taskTitle: string;
  subtaskTitle: string | null;
  onPause: () => void;
  onStop: () => void;
  onExpand: () => void;
}) {
  const label = subtaskTitle ? `${taskTitle} → ${subtaskTitle}` : taskTitle;
  const driftCount = session.drift_events?.length ?? 0;
  return (
    <Pressable
      onPress={onExpand}
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
          style={{ color: '#fff', fontSize: 10, opacity: 0.85, fontWeight: '600' }}
        >
          NOW TRACKING{driftCount > 0 ? ` · ⚡ ${driftCount} drift` : ''}
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
        onPress={onPause}
        style={{
          backgroundColor: 'rgba(255,255,255,0.2)',
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>⏸</Text>
      </Pressable>
      <Pressable
        onPress={onStop}
        style={{
          backgroundColor: 'rgba(255,255,255,0.2)',
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>⏹</Text>
      </Pressable>
    </Pressable>
  );
}
