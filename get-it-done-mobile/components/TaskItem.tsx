import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useStore } from '@/lib/store';
import { useLiveTimer } from '@/lib/useLiveTimer';
import { useUI } from '@/lib/ui-context';
import { fmtShort, isToday } from '@/lib/utils';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { TODAY_COLORS, TODAY_FONT } from './today/palette';
import type { Priority, Status, TaskType } from '@/types';

interface Props {
  task: TaskType;
}

type Rail = 'HIGH' | 'MED' | 'LOW';

const railFor = (p: Priority): Rail =>
  p === 'urgent' || p === 'high' ? 'HIGH' : p === 'medium' ? 'MED' : 'LOW';

const RAIL_COLOR: Record<Rail, string> = {
  HIGH: TODAY_COLORS.red,
  MED: TODAY_COLORS.yellow,
  LOW: TODAY_COLORS.teal,
};

const PRI_PILL = {
  HIGH: { bg: TODAY_COLORS.redTint, fg: TODAY_COLORS.red, label: 'High' },
  MED: { bg: TODAY_COLORS.yellowTint, fg: '#A16207', label: 'Medium' },
  LOW: { bg: TODAY_COLORS.tealTint, fg: TODAY_COLORS.teal, label: 'Low' },
} as const;

function formatDue(iso: string): string {
  if (isToday(iso)) return 'Today';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function TaskItem({ task }: Props) {
  const tags = useStore((s) => s.tags);
  const updateTask = useStore((s) => s.updateTask);
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

  const done = task.effective_status === 'done';
  const rail = railFor(task.priority);
  const railColor = RAIL_COLOR[rail];
  const priPill =
    task.priority === 'urgent'
      ? { ...PRI_PILL.HIGH, label: 'Urgent' }
      : PRI_PILL[rail];

  const invested = task.total_time_seconds + (isTrackingThisCard ? liveElapsed : 0);
  const est = task.estimated_seconds ?? 0;
  const investedMin = Math.round(invested / 60);
  const estMinutes = est > 0 ? Math.round(est / 60) : 0;

  const taskTags = task.tag_ids
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const firstTag = taskTags[0];

  const dueIsToday = task.due_date ? isToday(task.due_date) : false;
  const dueLabel = task.due_date ? formatDue(task.due_date) : null;

  const doneCount = task.subtasks.filter((s) => s.is_done).length;
  const subCount = task.subtasks.length;
  const subPct = subCount > 0 ? (doneCount / subCount) * 100 : 0;

  const checkScale = useSharedValue(1);
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const handleCheckbox = () => {
    const next: Status = done ? 'in_progress' : 'done';
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

  // Investment overrun color on the meta-row "invested" text (preserved behavior).
  let investedColor: string = TODAY_COLORS.ink3;
  if (est > 0) {
    if (invested > est * 1.5) investedColor = TODAY_COLORS.red;
    else if (invested > est) investedColor = TODAY_COLORS.orange;
  }

  return (
    <View
      accessible
      accessibilityLabel={[
        task.title,
        `priority ${priPill.label.toLowerCase()}`,
        firstTag ? `tag ${firstTag.name}` : null,
        dueLabel ? `due ${dueLabel}` : null,
        invested > 0 ? `invested ${fmtShort(invested)}` : null,
      ]
        .filter(Boolean)
        .join(', ')}
      style={{
        marginHorizontal: 20,
        marginBottom: 8,
        backgroundColor: TODAY_COLORS.card,
        borderWidth: 1,
        borderColor: TODAY_COLORS.border,
        borderRadius: 13,
        paddingVertical: 12,
        paddingLeft: 10,
        paddingRight: 14,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        minHeight: 52,
      }}
    >
      {/* Priority rail — 3px */}
      <View
        style={{
          width: 3,
          alignSelf: 'stretch',
          borderRadius: 3,
          backgroundColor: railColor,
          minHeight: 28,
        }}
      />

      {/* Checkbox — 18×18 */}
      <Animated.View style={[{ marginTop: 2 }, checkStyle]}>
        <Pressable
          onPress={handleCheckbox}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            borderWidth: done ? 0 : 1.5,
            borderColor: TODAY_COLORS.border,
            backgroundColor: done ? TODAY_COLORS.purple : TODAY_COLORS.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {done && (
            <MaterialCommunityIcons name="check" size={12} color="#fff" />
          )}
        </Pressable>
      </Animated.View>

      {/* Body */}
      <Pressable
        onPress={() => openEditTask(task.id)}
        style={{ flex: 1, minWidth: 0 }}
      >
        <Text
          style={{
            fontFamily: TODAY_FONT.medium,
            fontSize: 13.5,
            lineHeight: 19,
            color: done ? TODAY_COLORS.ink3 : TODAY_COLORS.ink,
            textDecorationLine: done ? 'line-through' : 'none',
            marginBottom: 6,
          }}
        >
          {task.title}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            rowGap: 4,
            columnGap: 6,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 5,
              backgroundColor: priPill.bg,
            }}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: railColor,
              }}
            />
            <Text
              style={{
                fontFamily: TODAY_FONT.bold,
                fontSize: 10,
                color: priPill.fg,
              }}
            >
              {priPill.label}
            </Text>
          </View>

          {firstTag && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: TODAY_COLORS.border,
              }}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: firstTag.color,
                }}
              />
              <Text
                style={{
                  fontFamily: TODAY_FONT.semibold,
                  fontSize: 10,
                  color: TODAY_COLORS.ink2,
                }}
              >
                {firstTag.name}
              </Text>
            </View>
          )}

          {est > 0 && (
            <Text
              style={{
                fontFamily: TODAY_FONT.semibold,
                fontSize: 10.5,
                color: TODAY_COLORS.purpleStrong,
              }}
            >
              {invested > 0
                ? `${investedMin}m / ${estMinutes}m`
                : `~${estMinutes}m`}
            </Text>
          )}

          {est === 0 && invested > 0 && (
            <Text
              style={{
                fontFamily: TODAY_FONT.semibold,
                fontSize: 10.5,
                color: investedColor,
                fontVariant: ['tabular-nums'],
              }}
            >
              {fmtShort(invested)}
            </Text>
          )}

          {dueLabel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MaterialCommunityIcons
                name="calendar-blank-outline"
                size={12}
                color={dueIsToday ? TODAY_COLORS.red : TODAY_COLORS.ink3}
              />
              <Text
                style={{
                  fontFamily: TODAY_FONT.semibold,
                  fontSize: 10.5,
                  color: dueIsToday ? TODAY_COLORS.red : TODAY_COLORS.ink3,
                }}
              >
                {dueLabel}
              </Text>
            </View>
          )}
        </View>

        {subCount > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
            }}
          >
            <View
              style={{
                flex: 1,
                height: 4,
                backgroundColor: TODAY_COLORS.chipBg,
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${subPct}%`,
                  backgroundColor: TODAY_COLORS.purple,
                  borderRadius: 2,
                }}
              />
            </View>
            <Text
              style={{
                fontFamily: TODAY_FONT.bold,
                fontSize: 10,
                color: TODAY_COLORS.ink3,
                fontVariant: ['tabular-nums'],
              }}
            >
              {doneCount}/{subCount}
            </Text>
          </View>
        )}
      </Pressable>

      {/* Play/Stop button — 32×32 round */}
      <Pressable
        onPress={handleTimerPress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={isTrackingThisTask ? 'Stop timer' : 'Start timer'}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          marginTop: 2,
          borderWidth: isTrackingThisTask ? 0 : 1.5,
          borderColor: TODAY_COLORS.border,
          backgroundColor: isTrackingThisTask
            ? TODAY_COLORS.purple
            : TODAY_COLORS.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons
          name={isTrackingThisTask ? 'stop' : 'play'}
          size={14}
          color={isTrackingThisTask ? '#fff' : TODAY_COLORS.ink2}
          style={!isTrackingThisTask ? { marginLeft: 2 } : undefined}
        />
      </Pressable>
    </View>
  );
}
