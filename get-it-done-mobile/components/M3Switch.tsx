import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from 'react-native-paper';

interface Props {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

const TRACK_W = 52;
const TRACK_H = 32;
const HANDLE_OFF = 16;
const HANDLE_ON = 24;
const PAD = 4;
const DURATION = 200;

export function M3Switch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: Props) {
  const theme = useTheme();
  const c = theme.colors;
  const progress = useSharedValue(value ? 1 : 0);
  const easing = Easing.bezier(0.2, 0, 0, 1);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, {
      duration: DURATION,
      easing,
    });
  }, [value, easing, progress]);

  const trackStyle = useAnimatedStyle(() => {
    const offBg = c.elevation.level3;
    const onBg = c.primary;
    const mix = progress.value;
    return {
      backgroundColor: mix > 0.5 ? onBg : offBg,
      borderColor: mix > 0.5 ? c.primary : c.outline,
    };
  });

  const handleStyle = useAnimatedStyle(() => {
    const size = HANDLE_OFF + (HANDLE_ON - HANDLE_OFF) * progress.value;
    const maxLeft = TRACK_W - PAD - HANDLE_ON;
    const left = PAD + (maxLeft - PAD) * progress.value;
    const topOffset = (TRACK_H - size) / 2;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: progress.value > 0.5 ? c.onPrimary : c.outline,
      left,
      top: topOffset - 2, // subtract 2dp border so handle centers
    };
  });

  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View
        style={[
          {
            width: TRACK_W,
            height: TRACK_H,
            borderRadius: 16,
            borderWidth: 2,
            position: 'relative',
          },
          trackStyle,
        ]}
      >
        <Animated.View style={[{ position: 'absolute' }, handleStyle]} />
      </Animated.View>
    </Pressable>
  );
}
