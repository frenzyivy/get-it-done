import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { useLiveTimer } from '@/lib/useLiveTimer';
import { fmt } from '@/lib/utils';
import { type as M3Type } from '@/lib/theme';

export function TrackingCard() {
  const theme = useTheme();

  // Prototype palette — prototype wins over spec's primaryContainer suggestion.
  // Focus (light): near-black bar with warm off-white text + red pulse.
  // Momentum (dark): lime-yellow bar with near-black text + near-black pulse.
  const barBg = theme.dark ? '#E4FF3A' : '#1A1714';
  const barFg = theme.dark ? '#0C0B0A' : '#F6F4EF';
  const pulseColor = theme.dark ? '#0C0B0A' : '#FF6B5B';
  const stopBg = theme.dark ? 'rgba(0,0,0,0.15)' : 'rgba(246,244,239,0.15)';

  const activeSessions = useStore((s) => s.activeSessions);
  const tasks = useStore((s) => s.tasks);
  const pauseSession = useStore((s) => s.pauseSession);
  const elapsed = useLiveTimer();

  const active = activeSessions[activeSessions.length - 1] ?? null;
  const pulse = useSharedValue(0);
  const slide = useSharedValue(12);
  const slideOpacity = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      pulse.value = 0;
      slide.value = 12;
      slideOpacity.value = 0;
      return;
    }
    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    // Slide-down + fade-in per spec §6 standard-decelerate.
    slide.value = 12;
    slideOpacity.value = 0;
    slide.value = withTiming(0, {
      duration: 250,
      easing: Easing.bezier(0, 0, 0, 1),
    });
    slideOpacity.value = withTiming(1, {
      duration: 250,
      easing: Easing.bezier(0, 0, 0, 1),
    });
  }, [active, pulse, slide, slideOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 1.6 }],
    opacity: 0.9 - pulse.value * 0.9,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slide.value }],
    opacity: slideOpacity.value,
  }));

  if (!active) return null;

  const task = tasks.find((t) => t.id === active.task_id);
  const subtask = task?.subtasks.find((s) => s.id === active.subtask_id);
  const label = subtask?.title ?? task?.title ?? 'Tracking…';

  return (
    <Animated.View
      style={[cardStyle, {
        marginTop: 8,
        marginHorizontal: 16,
        paddingLeft: 16,
        paddingRight: 12,
        paddingVertical: 10,
        borderRadius: 16,
        backgroundColor: barBg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }]}
    >
      {/* Pulsing dot */}
      <View
        style={{
          width: 10,
          height: 10,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            position: 'absolute',
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: pulseColor,
          }}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: pulseColor,
            },
            pulseStyle,
          ]}
        />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            ...M3Type.labelSmall,
            color: barFg,
            opacity: 0.6,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
          }}
        >
          Tracking
        </Text>
        <Text
          numberOfLines={1}
          style={{
            ...M3Type.titleSmall,
            color: barFg,
          }}
        >
          {label}
        </Text>
      </View>

      <Text
        style={{
          ...M3Type.titleMedium,
          color: barFg,
          fontVariant: ['tabular-nums'],
        }}
      >
        {fmt(elapsed)}
      </Text>

      <Pressable
        onPress={() => void pauseSession(active.id)}
        accessibilityRole="button"
        accessibilityLabel="Pause timer"
        hitSlop={6}
        style={({ pressed }) => ({
          width: 30,
          height: 30,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: stopBg,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {/* Solid square glyph — prototype style */}
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 1.5,
            backgroundColor: barFg,
          }}
        />
      </Pressable>
    </Animated.View>
  );
}
