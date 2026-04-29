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
import { useLiveTimers } from '@/lib/useLiveTimer';
import { fmt } from '@/lib/utils';
import { type as M3Type } from '@/lib/theme';
import type { TrackedSession } from '@/types';

// Spec § Now Tracking — Phase 7 step A1 mobile redesign.
//
// In light mode: ink-black card (#1a1a2e), white text, white pulsing dot.
// In dark mode: keep the M3 "Momentum" lime palette so the bar still feels
// part of the existing dark-theme prototype Komal is using.
//
// Layout: NOW TRACKING mono caps + pulsing dot + optional mode pill on the
// top row, task title (one line) below, then "project · CATEGORY · PRIORITY"
// meta line in mono. Right side: 32px mono tabular-nums timer, plus a
// vertical pill stack (Focus / Pause / Stop).

export function TrackingCard() {
  const theme = useTheme();

  // Light: spec ink black + white text + white dot.
  // Dark: prototype lime + near-black text + near-black dot.
  const barBg = theme.dark ? '#E4FF3A' : '#1a1a2e';
  const barFg = theme.dark ? '#0C0B0A' : '#ffffff';
  const pulseColor = theme.dark ? '#0C0B0A' : '#ffffff';
  const subtleBtnBg = theme.dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
  const subtleBtnHover = theme.dark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.20)';
  const outlineBtnBorder = theme.dark ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.20)';
  const focusBtnBg = theme.dark ? '#0C0B0A' : '#ffffff';
  const focusBtnFg = theme.dark ? '#E4FF3A' : '#1a1a2e';

  const activeSessions = useStore((s) => s.activeSessions);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
  const pauseSession = useStore((s) => s.pauseSession);
  const stopSession = useStore((s) => s.stopSession);
  const openFocusMode = useStore((s) => s.openFocusMode);
  const elapsedMap = useLiveTimers();

  // Mobile shows the *latest* active session in the bar; web shows the full
  // stack. Multi-session UX on mobile: tapping the body opens that session's
  // focus screen, where the user can switch between active sessions.
  const active = activeSessions[activeSessions.length - 1] ?? null;
  const elapsed = active ? (elapsedMap[active.id] ?? 0) : 0;

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
  const label = subtask
    ? `${task?.title ?? 'Tracking…'} → ${subtask.title}`
    : task?.title ?? 'Tracking…';

  // Meta line: project · CATEGORY · PRIORITY
  const proj = task?.project_ids[0]
    ? projects.find((p) => p.id === task.project_ids[0])
    : null;
  const cat = task?.category_ids[0]
    ? categories.find((c) => c.id === task.category_ids[0])
    : null;
  const metaSegments: string[] = [];
  if (proj) metaSegments.push(proj.name);
  if (cat) metaSegments.push(cat.name.toUpperCase());
  if (task?.priority) metaSegments.push(`${task.priority.toUpperCase()} PRIORITY`);
  const metaLine = metaSegments.join(' · ');

  const driftCount = active.drift_events?.length ?? 0;
  const totalActive = activeSessions.length;

  return (
    <Animated.View
      style={[
        cardStyle,
        {
          marginTop: 8,
          marginHorizontal: 16,
          paddingLeft: 16,
          paddingRight: 12,
          paddingVertical: 12,
          borderRadius: 16,
          backgroundColor: barBg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
      ]}
    >
      {/* Left column — pulsing dot + label + meta */}
      <Pressable
        onPress={() => openFocusMode(active.id)}
        style={{ flex: 1, minWidth: 0 }}
        accessibilityRole="button"
        accessibilityLabel="Open full-screen focus view"
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 2,
          }}
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
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: pulseColor,
              }}
            />
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: pulseColor,
                },
                pulseStyle,
              ]}
            />
          </View>
          <Text
            style={{
              ...M3Type.labelSmall,
              color: barFg,
              opacity: 0.85,
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              fontWeight: '700',
            }}
          >
            Now tracking
          </Text>
          {totalActive >= 2 && (
            <View
              style={{
                backgroundColor: subtleBtnBg,
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 4,
              }}
            >
              <Text
                style={{
                  color: barFg,
                  fontSize: 9,
                  fontWeight: '700',
                  letterSpacing: 0.5,
                }}
              >
                +{totalActive - 1}
              </Text>
            </View>
          )}
          {driftCount > 0 && (
            <View
              style={{
                backgroundColor: 'rgba(220,38,38,0.85)',
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 4,
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: '700',
                  letterSpacing: 0.5,
                }}
              >
                ⚡ {driftCount}
              </Text>
            </View>
          )}
        </View>
        <Text
          numberOfLines={1}
          style={{
            color: barFg,
            fontSize: 15,
            fontWeight: '700',
            lineHeight: 19,
          }}
        >
          {label}
        </Text>
        {metaLine.length > 0 && (
          <Text
            numberOfLines={1}
            style={{
              color: barFg,
              opacity: 0.55,
              fontSize: 10,
              letterSpacing: 1,
              marginTop: 2,
            }}
          >
            {metaLine}
          </Text>
        )}
      </Pressable>

      {/* Middle column — 32px mono tabular timer */}
      <Text
        style={{
          color: barFg,
          fontSize: 28,
          lineHeight: 32,
          fontVariant: ['tabular-nums'],
          fontWeight: '800',
        }}
      >
        {fmt(elapsed)}
      </Text>

      {/* Right column — Focus / Pause / Stop pill stack */}
      <View style={{ gap: 4 }}>
        <Pressable
          onPress={() => openFocusMode(active.id)}
          accessibilityRole="button"
          accessibilityLabel="Open full-screen focus view"
          hitSlop={4}
          style={({ pressed }) => ({
            backgroundColor: focusBtnBg,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              color: focusBtnFg,
              fontSize: 10,
              fontWeight: '800',
              letterSpacing: 0.3,
            }}
          >
            ↗ Focus
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void pauseSession(active.id)}
          accessibilityRole="button"
          accessibilityLabel="Pause timer"
          hitSlop={4}
          style={({ pressed }) => ({
            backgroundColor: pressed ? subtleBtnHover : subtleBtnBg,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
          })}
        >
          <Text
            style={{
              color: barFg,
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 0.3,
            }}
          >
            ⏸ Pause
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void stopSession(active.id)}
          accessibilityRole="button"
          accessibilityLabel="Stop timer and save session"
          hitSlop={4}
          style={({ pressed }) => ({
            backgroundColor: pressed ? subtleBtnBg : 'transparent',
            borderColor: outlineBtnBorder,
            borderWidth: 1,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
          })}
        >
          <Text
            style={{
              color: barFg,
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 0.3,
            }}
          >
            ⏹ Stop
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// Small wrapper so the "useLiveTimers" import stays referenced even when the
// callsite-level changes shake out. Kept the name `useLiveTimers` (plural)
// because that's the live multi-session helper; older code used
// `useLiveTimer` (singular) which only watched one session.
//
// Re-export for any consumer that imports TrackedSession from this file.
export type { TrackedSession };
