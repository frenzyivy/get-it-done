import { Pressable, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useStore } from '@/lib/store';
import { useLiveTimer } from '@/lib/useLiveTimer';
import { fmt } from '@/lib/utils';
import { TODAY_COLORS, TODAY_FONT } from './palette';

// Map task priority → mockup meta-chip dot color.
function priColor(priority: string): string {
  if (priority === 'urgent' || priority === 'high') return TODAY_COLORS.red;
  if (priority === 'medium') return TODAY_COLORS.yellow;
  return TODAY_COLORS.teal;
}

function priLabel(priority: string): string {
  if (priority === 'urgent') return 'Urgent';
  if (priority === 'high') return 'High';
  if (priority === 'medium') return 'Medium';
  return 'Low';
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function NowHeroCard() {
  const activeSessions = useStore((s) => s.activeSessions);
  const tasks = useStore((s) => s.tasks);
  const tags = useStore((s) => s.tags);
  const pauseSession = useStore((s) => s.pauseSession);
  const stopSession = useStore((s) => s.stopSession);
  const openFocusMode = useStore((s) => s.openFocusMode);
  const elapsed = useLiveTimer();

  const active = activeSessions[activeSessions.length - 1] ?? null;
  if (!active) return null;

  const task = tasks.find((t) => t.id === active.task_id);
  const subtask = task?.subtasks.find((s) => s.id === active.subtask_id);
  const title = subtask?.title ?? task?.title ?? 'Tracking…';

  const firstTag = task?.tag_ids
    .map((id) => tags.find((t) => t.id === id))
    .find((t): t is NonNullable<typeof t> => Boolean(t));

  const startedAt = new Date(active.started_at);
  const startedHm = `${pad2(startedAt.getHours())}:${pad2(startedAt.getMinutes())}`;

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginBottom: 16,
        backgroundColor: TODAY_COLORS.inkDark,
        borderRadius: 18,
        paddingHorizontal: 18,
        paddingVertical: 16,
        overflow: 'hidden',
      }}
    >
      {/* Faux radial glow: a translucent purple disc in the top-right corner. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -60,
          right: -60,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: 'rgba(124,92,255,0.35)',
          opacity: 0.9,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -30,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: 'rgba(124,92,255,0.18)',
        }}
      />

      {/* Top row — tracking label + elapsed chip */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: TODAY_COLORS.red,
            }}
          />
          <Text
            style={{
              fontFamily: TODAY_FONT.extrabold,
              fontSize: 10,
              letterSpacing: 1.4,
              color: 'rgba(255,255,255,0.6)',
              textTransform: 'uppercase',
            }}
          >
            Tracking · {startedHm}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
          }}
        >
          <Text
            style={{
              fontFamily: TODAY_FONT.bold,
              fontSize: 13,
              color: '#fff',
              fontVariant: ['tabular-nums'],
            }}
          >
            {fmt(elapsed)}
          </Text>
        </View>
      </View>

      {/* Title — tap opens Focus mode */}
      <Pressable onPress={() => openFocusMode(active.id)}>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: TODAY_FONT.semibold,
            fontSize: 16,
            lineHeight: 22,
            color: '#fff',
            marginBottom: 14,
            paddingRight: 10,
          }}
        >
          {title}
        </Text>
      </Pressable>

      {/* Controls row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            flex: 1,
            marginRight: 10,
          }}
        >
          {task && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
                backgroundColor: 'rgba(255,255,255,0.1)',
              }}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: priColor(task.priority),
                }}
              />
              <Text
                style={{
                  fontFamily: TODAY_FONT.semibold,
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.85)',
                }}
              >
                {priLabel(task.priority)}
              </Text>
            </View>
          )}
          {firstTag && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
                backgroundColor: 'rgba(255,255,255,0.1)',
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
                  color: 'rgba(255,255,255,0.85)',
                }}
              >
                {firstTag.name}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => void stopSession(active.id)}
            accessibilityRole="button"
            accessibilityLabel="Stop tracking"
            hitSlop={6}
            style={({ pressed }) => ({
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: pressed
                ? 'rgba(255,255,255,0.22)'
                : 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <MaterialCommunityIcons name="stop" size={16} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => void pauseSession(active.id)}
            accessibilityRole="button"
            accessibilityLabel="Pause tracking"
            hitSlop={6}
            style={({ pressed }) => ({
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: pressed ? '#e8e7f0' : '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <MaterialCommunityIcons
              name="pause"
              size={16}
              color={TODAY_COLORS.inkDark}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
