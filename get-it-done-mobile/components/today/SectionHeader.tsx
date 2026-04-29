import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { TODAY_COLORS, TODAY_FONT } from './palette';

export type SectionAccent = 'default' | 'upnext' | 'live' | 'done';

interface Props {
  label: string;
  count: number | null;
  accent?: SectionAccent;
}

export function SectionHeader({ label, count, accent = 'default' }: Props) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (accent !== 'live') return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [accent, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 1 - 0.4 * pulse.value,
    transform: [{ scale: 1 + 0.4 * pulse.value }],
  }));

  const labelColor =
    accent === 'upnext'
      ? TODAY_COLORS.purpleStrong
      : accent === 'done'
      ? TODAY_COLORS.green
      : TODAY_COLORS.ink3;

  const pillBg =
    accent === 'live'
      ? 'rgba(220,38,38,0.1)'
      : accent === 'done'
      ? TODAY_COLORS.greenTint
      : TODAY_COLORS.chipBg;
  const pillColor =
    accent === 'live'
      ? TODAY_COLORS.red
      : accent === 'done'
      ? TODAY_COLORS.green
      : TODAY_COLORS.ink3;
  const pillLabel = accent === 'live' ? 'live' : count !== null ? String(count) : '';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginTop: 4,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {accent === 'live' && (
          <View
            style={{
              width: 6,
              height: 6,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: TODAY_COLORS.red,
                },
                pulseStyle,
              ]}
            />
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: TODAY_COLORS.red,
              }}
            />
          </View>
        )}
        <Text
          style={{
            fontFamily: TODAY_FONT.extrabold,
            fontSize: 10,
            letterSpacing: 1.2,
            color: labelColor,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
      </View>
      {(count !== null || accent === 'live') && pillLabel.length > 0 && (
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 20,
            backgroundColor: pillBg,
          }}
        >
          <Text
            style={{
              fontFamily: TODAY_FONT.bold,
              fontSize: 11,
              color: pillColor,
            }}
          >
            {pillLabel}
          </Text>
        </View>
      )}
    </View>
  );
}
