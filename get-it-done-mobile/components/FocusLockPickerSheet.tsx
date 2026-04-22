import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import {
  FOCUS_LOCK_TO_MODE,
  type FocusLockLevel,
  type TaskType,
} from '@/types';

// Screen 1 of the Focus Lock flow — "Choose Lock Level".
// Opened from the Day FAB (long-press), the task-card play button
// (long-press), and Settings. Writes a new tracked_sessions row with the
// chosen mode + planned duration, then hands off to FocusModeScreen
// (Screen 2) which is mounted globally.

export interface FocusLockPickerHandle {
  // taskId is required — we always track against a task/subtask pair.
  // scope picker lives inside the sheet.
  open: (taskId: string, subtaskId?: string | null) => void;
  close: () => void;
}

const LEVELS: {
  id: FocusLockLevel;
  label: string;
  badge?: { text: string; color: string };
  blurb: string;
}[] = [
  {
    id: 'just_track',
    label: 'Just track',
    blurb: 'Track time. No restrictions.',
  },
  {
    id: 'focus',
    label: 'Focus',
    badge: { text: 'RECOMMENDED', color: '#6B5BF5' },
    blurb: 'App stays foreground. Backgrounding logs drift.',
  },
  {
    id: 'no_mercy',
    label: 'No mercy',
    badge: { text: 'NO MERCY', color: '#E5447A' },
    blurb: 'Leaving breaks session + streak. Must type reason.',
  },
];

const DURATIONS: { label: string; minutes: number | null }[] = [
  { label: '25m', minutes: 25 },
  { label: '50m', minutes: 50 },
  { label: '90m', minutes: 90 },
  { label: 'Free', minutes: null },
];

export const FocusLockPickerSheet = forwardRef<FocusLockPickerHandle>(
  (_props, ref) => {
    const [visible, setVisible] = useState(false);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [subtaskId, setSubtaskId] = useState<string | null>(null);
    const [level, setLevel] = useState<FocusLockLevel>('focus');
    const [minutes, setMinutes] = useState<number | null>(50);

    const tasks = useStore((s) => s.tasks);
    const startTrackingTask = useStore((s) => s.startTrackingTask);
    const openFocusMode = useStore((s) => s.openFocusMode);

    useImperativeHandle(
      ref,
      () => ({
        open: (tId, stId = null) => {
          setTaskId(tId);
          setSubtaskId(stId);
          setLevel('focus');
          setMinutes(50);
          setVisible(true);
        },
        close: () => setVisible(false),
      }),
      [],
    );

    const task: TaskType | null = useMemo(
      () => (taskId ? tasks.find((t) => t.id === taskId) ?? null : null),
      [tasks, taskId],
    );
    const subtask = useMemo(
      () =>
        task && subtaskId
          ? task.subtasks.find((s) => s.id === subtaskId) ?? null
          : null,
      [task, subtaskId],
    );

    const handleStart = useCallback(async () => {
      if (!taskId) return;
      const mode = FOCUS_LOCK_TO_MODE[level];
      const plannedSeconds = minutes === null ? null : minutes * 60;
      const session = await startTrackingTask(
        taskId,
        subtaskId,
        mode,
        plannedSeconds,
      );
      setVisible(false);
      if (session) openFocusMode(session.id);
    }, [taskId, subtaskId, level, minutes, startTrackingTask, openFocusMode]);

    if (!visible) return null;

    const buttonLabel =
      minutes === null
        ? level === 'just_track'
          ? 'Start tracking'
          : `Start ${levelShort(level)}`
        : `Start ${levelShort(level)} · ${minutes}m`;

    return (
      <Modal
        visible
        animationType="slide"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setVisible(false)} />
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 20,
              paddingTop: 14,
              paddingBottom: 28,
              maxHeight: '90%',
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                backgroundColor: '#E5E5E5',
                borderRadius: 2,
                alignSelf: 'center',
                marginBottom: 16,
              }}
            />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: '800',
                  color: '#1a1a2e',
                  marginBottom: 4,
                }}
              >
                Start timer
              </Text>
              {task && (
                <View
                  style={{
                    marginTop: 10,
                    backgroundColor: '#F6F3F9',
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: '#888',
                      letterSpacing: 0.5,
                    }}
                  >
                    TRACKING
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: '#1a1a2e',
                      marginTop: 4,
                    }}
                    numberOfLines={2}
                  >
                    {task.title}
                    {subtask ? ` → ${subtask.title}` : ''}
                  </Text>
                </View>
              )}

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: '#888',
                  marginTop: 18,
                  marginBottom: 10,
                  letterSpacing: 0.5,
                }}
              >
                HOW FOCUSED?
              </Text>

              {LEVELS.map((lvl) => {
                const active = level === lvl.id;
                return (
                  <Pressable
                    key={lvl.id}
                    onPress={() => setLevel(lvl.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={{
                      borderWidth: 2,
                      borderColor: active ? '#8b5cf6' : '#E5E5E5',
                      backgroundColor: active ? '#F5F2FF' : '#fff',
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 10,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '800',
                          color: '#1a1a2e',
                        }}
                      >
                        {lvl.label}
                      </Text>
                      {lvl.badge && (
                        <View
                          style={{
                            backgroundColor: lvl.badge.color,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 4,
                          }}
                        >
                          <Text
                            style={{
                              color: '#fff',
                              fontSize: 9,
                              fontWeight: '800',
                              letterSpacing: 0.5,
                            }}
                          >
                            {lvl.badge.text}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={{ fontSize: 12, color: '#666', marginTop: 4 }}
                    >
                      {lvl.blurb}
                    </Text>
                  </Pressable>
                );
              })}

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: '#888',
                  marginTop: 8,
                  marginBottom: 10,
                  letterSpacing: 0.5,
                }}
              >
                DURATION
              </Text>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                {DURATIONS.map((d) => {
                  const active = minutes === d.minutes;
                  return (
                    <Pressable
                      key={d.label}
                      onPress={() => setMinutes(d.minutes)}
                      style={{
                        flex: 1,
                        borderWidth: 2,
                        borderColor: active ? '#8b5cf6' : '#E5E5E5',
                        backgroundColor: active ? '#F5F2FF' : '#fff',
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: active ? '#8b5cf6' : '#1a1a2e',
                        }}
                      >
                        {d.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={handleStart}
                disabled={!taskId}
                style={{
                  marginTop: 22,
                  backgroundColor: '#8b5cf6',
                  borderRadius: 14,
                  paddingVertical: 16,
                  alignItems: 'center',
                  opacity: taskId ? 1 : 0.5,
                }}
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: '800',
                  }}
                >
                  {buttonLabel}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  },
);

FocusLockPickerSheet.displayName = 'FocusLockPickerSheet';

function levelShort(level: FocusLockLevel): string {
  switch (level) {
    case 'just_track':
      return 'tracking';
    case 'focus':
      return 'focus';
    case 'no_mercy':
      return 'no-mercy';
  }
}
