import { useEffect, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from 'react-native-paper';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { type as M3Type } from '@/lib/theme';
import { hapticSelection } from '@/lib/haptics';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface TabSpec {
  label: string;
  outlined: IconName;
  filled: IconName;
}

const TABS: Record<string, TabSpec> = {
  index: { label: 'Board', outlined: 'view-column-outline', filled: 'view-column' },
  list: { label: 'List', outlined: 'view-agenda-outline', filled: 'view-agenda' },
  schedule: { label: 'Day', outlined: 'clock-outline', filled: 'clock' },
  timeline: { label: 'Insights', outlined: 'chart-line', filled: 'chart-line-variant' },
  settings: { label: 'Settings', outlined: 'cog-outline', filled: 'cog' },
};

const ORDER = ['list', 'index', 'schedule', 'timeline', 'settings'] as const;

const PILL_W = 64;
const PILL_H = 32;

export function M3BottomNav({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [rowWidth, setRowWidth] = useState(0);

  const routesByName = Object.fromEntries(state.routes.map((r) => [r.name, r]));
  const ordered = ORDER.map((name) => routesByName[name]).filter(Boolean);
  const focusedRoute = state.routes[state.index];
  const focusedIndex = Math.max(
    0,
    ordered.findIndex((r) => r.key === focusedRoute?.key),
  );

  const tabWidth = rowWidth > 0 ? rowWidth / ordered.length : 0;
  const pillX = useSharedValue(0);

  useEffect(() => {
    if (tabWidth === 0) return;
    const target = focusedIndex * tabWidth + (tabWidth - PILL_W) / 2;
    pillX.value = withSpring(target, { stiffness: 400, damping: 32 });
  }, [focusedIndex, tabWidth, pillX]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  const onRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== rowWidth) {
      setRowWidth(w);
      // Set initial position without animation.
      const target = focusedIndex * (w / ordered.length) + (w / ordered.length - PILL_W) / 2;
      pillX.value = target;
    }
  };

  return (
    <View
      onLayout={onRowLayout}
      style={{
        backgroundColor: c.surface,
        borderTopWidth: 1,
        borderTopColor: c.outlineVariant,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 16),
        flexDirection: 'row',
        position: 'relative',
      }}
    >
      {/* Animated pill indicator behind icons */}
      {tabWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 12,
              left: 0,
              width: PILL_W,
              height: PILL_H,
              borderRadius: 16,
              backgroundColor: c.secondaryContainer,
            },
            pillStyle,
          ]}
        />
      )}

      {ordered.map((route) => {
        const spec = TABS[route.name];
        if (!spec) return null;

        const focused = focusedRoute?.key === route.key;
        const { options } = descriptors[route.key];

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            hapticSelection();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (navigation.navigate as any)(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? spec.label}
            onPress={onPress}
            onLongPress={onLongPress}
            style={{
              flex: 1,
              alignItems: 'center',
              gap: 4,
              minHeight: 56,
            }}
          >
            <View
              style={{
                width: PILL_W,
                height: PILL_H,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons
                name={focused ? spec.filled : spec.outlined}
                size={24}
                color={focused ? c.onSecondaryContainer : c.onSurfaceVariant}
              />
            </View>
            <Text
              numberOfLines={1}
              style={{
                ...M3Type.labelMedium,
                fontWeight: focused ? '600' : '500',
                color: focused ? c.onSurface : c.onSurfaceVariant,
              }}
            >
              {spec.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
