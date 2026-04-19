import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { fmtShort } from '@/lib/utils';
import { useStore } from '@/lib/store';
import type { SubtaskType } from '@/types';

// taskTitle is still in Props for API stability but no longer consumed after
// Feature 4 (concurrent timers) removed the "switch" confirmation prompt.

interface Props {
  subtask: SubtaskType;
  taskId: string;
  taskTitle: string;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

// Feature 2a (mobile) — every subtask row gets its own play button. Clicking it
// starts the global tracker with `subtask_id` set so time is attributed to the
// specific subtask. Existing NowTrackingBar already shows "task → subtask".
export function SubtaskItem({
  subtask,
  taskId,
  taskTitle,
  onToggle,
  onDelete,
  onRename,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(subtask.title);
  const activeSessions = useStore((s) => s.activeSessions);
  const startTrackingTask = useStore((s) => s.startTrackingTask);
  const stopSession = useStore((s) => s.stopSession);
  const openFocusMode = useStore((s) => s.openFocusMode);
  const prefs = useStore((s) => s.prefs);

  // Silence unused-prop warnings (Feature 4 dropped the task-title prompt).
  void taskTitle;

  const runningForThisSubtask = activeSessions.find(
    (s) => s.subtask_id === subtask.id,
  );
  const isTrackingThis = !!runningForThisSubtask;

  const commit = () => {
    const next = val.trim();
    if (next && next !== subtask.title) onRename(next);
    setEditing(false);
  };

  const handlePlay = () => {
    if (isTrackingThis && runningForThisSubtask) {
      return void stopSession(runningForThisSubtask.id);
    }
    const defaultMode = prefs?.default_timer_mode ?? 'open';
    void (async () => {
      const session = await startTrackingTask(taskId, subtask.id, defaultMode);
      if (session && defaultMode !== 'open') openFocusMode(session.id);
    })();
  };

  const confirmDelete = () =>
    Alert.alert('Remove subtask?', subtask.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 5,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.04)',
      }}
    >
      <Pressable
        onPress={onToggle}
        hitSlop={6}
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          borderWidth: subtask.is_done ? 0 : 2,
          borderColor: '#ccc',
          backgroundColor: subtask.is_done ? '#10b981' : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {subtask.is_done && (
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>
        )}
      </Pressable>

      {editing ? (
        <TextInput
          value={val}
          autoFocus
          onChangeText={setVal}
          onBlur={commit}
          onSubmitEditing={commit}
          returnKeyType="done"
          style={{
            flex: 1,
            fontSize: 13,
            paddingVertical: 2,
            borderBottomWidth: 1.5,
            borderBottomColor: '#8b5cf6',
          }}
        />
      ) : (
        <Pressable onLongPress={() => setEditing(true)} style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 13,
              color: subtask.is_done ? '#aaa' : '#333',
              textDecorationLine: subtask.is_done ? 'line-through' : 'none',
            }}
          >
            {subtask.title}
          </Text>
        </Pressable>
      )}

      {subtask.total_time_seconds > 0 && (
        <View
          style={{
            backgroundColor: 'rgba(139,92,246,0.08)',
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 5,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#8b5cf6' }}>
            🕐 {fmtShort(subtask.total_time_seconds)}
          </Text>
        </View>
      )}

      <Pressable
        onPress={handlePlay}
        hitSlop={6}
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: isTrackingThis ? '#8b5cf6' : 'rgba(139,92,246,0.1)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: isTrackingThis ? '#fff' : '#8b5cf6',
            fontSize: 11,
            fontWeight: '800',
          }}
        >
          {isTrackingThis ? '⏸' : '▶'}
        </Text>
      </Pressable>

      <Pressable onPress={confirmDelete} hitSlop={8}>
        <Text style={{ color: '#ccc', fontSize: 16 }}>×</Text>
      </Pressable>
    </View>
  );
}
