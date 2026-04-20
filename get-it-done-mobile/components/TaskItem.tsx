import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { useLiveTimer } from '@/lib/useLiveTimer';
import { useUI } from '@/lib/ui-context';
import { fmtShort, isToday } from '@/lib/utils';
import { type as M3Type } from '@/lib/theme';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import type { Priority, Status, TaskType } from '@/types';

interface Props {
  task: TaskType;
}

type Rail = 'HIGH' | 'MED' | 'LOW';

const railFor = (p: Priority): Rail =>
  p === 'urgent' || p === 'high' ? 'HIGH' : p === 'medium' ? 'MED' : 'LOW';

export function TaskItem({ task }: Props) {
  const theme = useTheme();
  const c = theme.colors;
  const mono = { fontVariant: ['tabular-nums'] as ['tabular-nums'] };

  const [open, setOpen] = useState(false);

  const tags = useStore((s) => s.tags);
  const updateTask = useStore((s) => s.updateTask);
  const toggleSubtask = useStore((s) => s.toggleSubtask);
  const activeSessions = useStore((s) => s.activeSessions);
  const startTrackingTask = useStore((s) => s.startTrackingTask);
  const stopSession = useStore((s) => s.stopSession);
  const { openEditTask } = useUI();

  const liveElapsed = useLiveTimer();

  const trackingTaskSession = activeSessions.find(
    (s) => s.task_id === task.id && s.subtask_id === null,
  );
  const trackingAnyOnTask = activeSessions.find((s) => s.task_id === task.id);
  const isTrackingThisTask = Boolean(trackingTaskSession);
  const isTrackingThisCard = Boolean(trackingAnyOnTask);

  const done = task.status === 'done';
  const rail = railFor(task.priority);
  const railColor =
    rail === 'HIGH' ? c.error : rail === 'MED' ? c.tertiary : c.outline;

  const invested = task.total_time_seconds + (isTrackingThisCard ? liveElapsed : 0);
  const est = task.estimated_seconds ?? 0;
  const estMinutes = est > 0 ? Math.round(est / 60) : 0;
  const investedMin = Math.round(invested / 60);

  let investedColor: string = c.onSurfaceVariant;
  if (est > 0) {
    if (invested > est * 1.5) investedColor = c.error;
    else if (invested > est) investedColor = c.tertiary;
  }

  const taskTags = task.tag_ids
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const firstTag = taskTags[0];

  const dueIsToday = isToday(task.due_date);
  const dueLabel = task.due_date
    ? dueIsToday
      ? 'Today'
      : new Date(task.due_date).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        })
    : null;

  const doneCount = task.subtasks.filter((s) => s.is_done).length;
  const subCount = task.subtasks.length;

  const checkScale = useSharedValue(1);
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const handleCheckbox = () => {
    const next: Status = done ? 'in_progress' : 'done';
    // 150ms scale-bounce (0.9 → 1.0) per spec §6.
    checkScale.value = withSequence(
      withTiming(0.9, { duration: 75, easing: Easing.bezier(0.2, 0, 0, 1) }),
      withTiming(1, { duration: 75, easing: Easing.bezier(0.2, 0, 0, 1) }),
    );
    if (!done) hapticSuccess();
    void updateTask(task.id, { status: next });
  };

  const handleTimerPress = () => {
    if (trackingTaskSession) {
      void stopSession(trackingTaskSession.id);
      return;
    }
    hapticLight();
    void startTrackingTask(task.id);
  };

  const rowBg = isTrackingThisTask ? c.primaryContainer : 'transparent';
  const titleColor = isTrackingThisTask
    ? c.onPrimaryContainer
    : done
    ? c.onSurfaceVariant
    : c.onSurface;

  const a11yLabel = [
    task.title,
    `priority ${rail.toLowerCase()}`,
    firstTag ? `tag ${firstTag.name}` : null,
    dueLabel ? `due ${dueLabel}` : null,
    invested > 0 ? `invested ${fmtShort(invested)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      accessible
      accessibilityLabel={a11yLabel}
      style={{
        position: 'relative',
        paddingVertical: 12,
        paddingLeft: 20,
        paddingRight: 8,
        minHeight: 72,
        backgroundColor: rowBg,
      }}
    >
      {/* Priority rail */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 12,
          bottom: 12,
          width: rail === 'HIGH' ? 4 : 3,
          backgroundColor: railColor,
          borderTopRightRadius: 2,
          borderBottomRightRadius: 2,
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        {/* Checkbox — 24dp M3 */}
        <Animated.View style={[{ marginTop: 2 }, checkStyle]}>
          <Pressable
            onPress={handleCheckbox}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            style={{
              width: 24,
              height: 24,
              borderRadius: 2,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: done ? 0 : 2,
              borderColor: c.onSurfaceVariant,
              backgroundColor: done ? c.primary : 'transparent',
            }}
          >
            {done && (
              <MaterialCommunityIcons name="check" size={18} color={c.onPrimary} />
            )}
          </Pressable>
        </Animated.View>

        {/* Content column */}
        <Pressable
          onPress={() => openEditTask(task.id)}
          onLongPress={() => subCount > 0 && setOpen((v) => !v)}
          style={{ flex: 1, minWidth: 0 }}
        >
          <Text
            style={{
              ...M3Type.bodyLarge,
              color: titleColor,
              textDecorationLine: done ? 'line-through' : 'none',
            }}
          >
            {task.title}
          </Text>

          {/* Meta row */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              marginTop: 8,
              rowGap: 6,
              columnGap: 6,
            }}
          >
            {/* Priority chip — hidden when LOW */}
            {rail !== 'LOW' && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 8,
                  height: 24,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: c.outlineVariant,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: railColor,
                  }}
                />
                <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant }}>
                  {rail === 'HIGH'
                    ? task.priority === 'urgent'
                      ? 'Urgent'
                      : 'High'
                    : 'Medium'}
                </Text>
              </View>
            )}

            {/* Tag chip */}
            {firstTag && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 8,
                  height: 24,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: c.outlineVariant,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: firstTag.color,
                  }}
                />
                <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant }}>
                  {firstTag.name}
                </Text>
              </View>
            )}

            {/* Due — inline text with today icon */}
            {dueLabel && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialCommunityIcons
                  name="calendar-today"
                  size={14}
                  color={dueIsToday ? c.error : c.onSurfaceVariant}
                />
                <Text
                  style={{
                    ...M3Type.bodyMedium,
                    color: dueIsToday ? c.error : c.onSurfaceVariant,
                  }}
                >
                  {dueLabel}
                </Text>
              </View>
            )}

            {/* Invested — Roboto Mono labelMedium */}
            {invested > 0 && (
              <Text
                style={{
                  ...M3Type.labelMedium,
                  ...mono,
                  color: investedColor,
                }}
              >
                {estMinutes > 0
                  ? `${investedMin}m / ${estMinutes}m`
                  : `${fmtShort(invested)}`}
              </Text>
            )}

            {/* Subtask disclosure */}
            {subCount > 0 && (
              <Pressable
                onPress={() => setOpen((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 2,
                  height: 24,
                  paddingHorizontal: 4,
                }}
              >
                <MaterialCommunityIcons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={c.onSurfaceVariant}
                />
                <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant }}>
                  {doneCount}/{subCount}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Subtask list */}
          {open && subCount > 0 && (
            <View style={{ marginTop: 8, gap: 8 }}>
              {task.subtasks.map((s) => {
                const runningForThisSub = activeSessions.find(
                  (x) => x.subtask_id === s.id,
                );
                const isTrackingThisSub = Boolean(runningForThisSub);
                return (
                  <View
                    key={s.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingLeft: isTrackingThisSub ? 7 : 0,
                      borderLeftWidth: isTrackingThisSub ? 3 : 0,
                      borderLeftColor: c.primary,
                    }}
                  >
                    <Pressable
                      onPress={() => void toggleSubtask(task.id, s.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: s.is_done }}
                      hitSlop={6}
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 2,
                        borderWidth: s.is_done ? 0 : 1.5,
                        borderColor: c.onSurfaceVariant,
                        backgroundColor: s.is_done ? c.primary : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {s.is_done && (
                        <MaterialCommunityIcons
                          name="check"
                          size={12}
                          color={c.onPrimary}
                        />
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => void toggleSubtask(task.id, s.id)}
                      style={{ flex: 1 }}
                    >
                      <Text
                        style={{
                          ...M3Type.bodyMedium,
                          color: s.is_done ? c.onSurfaceVariant : c.onSurface,
                          textDecorationLine: s.is_done ? 'line-through' : 'none',
                        }}
                      >
                        {s.title}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (isTrackingThisSub && runningForThisSub) {
                          void stopSession(runningForThisSub.id);
                        } else {
                          void startTrackingTask(task.id, s.id);
                        }
                      }}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isTrackingThisSub ? 'Stop subtask timer' : 'Start subtask timer'
                      }
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: isTrackingThisSub
                          ? c.primary
                          : c.elevation.level2,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <MaterialCommunityIcons
                        name={isTrackingThisSub ? 'stop' : 'play'}
                        size={14}
                        color={isTrackingThisSub ? c.onPrimary : c.primary}
                      />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </Pressable>

        {/* Timer button — 40dp IconButton */}
        <Pressable
          onPress={handleTimerPress}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={isTrackingThisTask ? 'Pause timer' : 'Start timer'}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: isTrackingThisTask ? 0 : 1,
            borderColor: c.outline,
            backgroundColor: isTrackingThisTask ? c.primary : 'transparent',
          }}
        >
          <MaterialCommunityIcons
            name={isTrackingThisTask ? 'pause' : 'play'}
            size={20}
            color={isTrackingThisTask ? c.onPrimary : c.onSurface}
          />
        </Pressable>
      </View>
    </View>
  );
}
