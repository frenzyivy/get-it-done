import { Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

// Phase 7 step C — single calendar day cell, mobile RN port of the web
// CalendarDay.tsx. Same 6 ring states + same ring math (r=44 in 100x100
// viewBox, c = 2πr ≈ 276.46).

const R = 44;
const C_CIRC = 2 * Math.PI * R;

export type RingState =
  | 'no_data'
  | 'rest_day'
  | 'partial'
  | 'goal_hit'
  | 'exceeded'
  | 'rest_bonus';

export function ringState(secondsLogged: number, targetHours: number): RingState {
  const hours = secondsLogged / 3600;
  if (targetHours === 0 && hours === 0) return 'rest_day';
  if (targetHours === 0 && hours > 0) return 'rest_bonus';
  if (hours === 0) return 'no_data';
  if (hours > targetHours) return 'exceeded';
  if (hours >= targetHours) return 'goal_hit';
  return 'partial';
}

interface Props {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  secondsLogged: number;
  targetHours: number;
  size: number;
}

export function CalendarDay({
  date,
  inMonth,
  isToday,
  secondsLogged,
  targetHours,
  size,
}: Props) {
  const state = ringState(secondsLogged, targetHours);
  const hours = secondsLogged / 3600;

  const visualRatio =
    targetHours > 0 ? Math.min(1, hours / targetHours) : hours > 0 ? 1 : 0;
  const dashOffset = C_CIRC * (1 - visualRatio);

  const showRing =
    state === 'partial' ||
    state === 'goal_hit' ||
    state === 'exceeded' ||
    state === 'rest_bonus';

  const strokeWidth = state === 'exceeded' ? 5 : 3;
  const dim = !inMonth || state === 'rest_day';

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dim ? 0.45 : 1,
      }}
    >
      {showRing && (
        <Svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Faint backdrop track — partial / goal_hit / exceeded */}
          {state !== 'rest_bonus' && (
            <Circle
              cx={50}
              cy={50}
              r={R}
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={2}
            />
          )}
          {/* Active arc */}
          <G rotation={-90} originX={50} originY={50}>
            <Circle
              cx={50}
              cy={50}
              r={R}
              fill="none"
              stroke="#fff"
              strokeWidth={strokeWidth}
              strokeDasharray={`${C_CIRC},${C_CIRC}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          </G>
        </Svg>
      )}
      <Text
        style={{
          color: '#fff',
          fontSize: 12,
          fontWeight: isToday ? '800' : '700',
          fontVariant: ['tabular-nums'],
        }}
      >
        {date.getDate()}
      </Text>
      {isToday && (
        <View
          style={{
            position: 'absolute',
            bottom: '14%',
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: '#fff',
          }}
        />
      )}
    </View>
  );
}
