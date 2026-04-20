import { Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui-context';
import { fmtShort, isToday } from '@/lib/utils';
import { type as M3Type } from '@/lib/theme';

const SIZE = 56;
const STROKE = 5;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function Ring({
  pct,
  ring,
  track,
  label,
  labelColor,
}: {
  pct: number;
  ring: string;
  track: string;
  label: string;
  labelColor: string;
}) {
  const dash = CIRC * (1 - Math.min(1, Math.max(0, pct)));
  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg
        width={SIZE}
        height={SIZE}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={track} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={ring}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={dash}
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          inset: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ ...M3Type.titleMedium, color: labelColor }}>{label}</Text>
      </View>
    </View>
  );
}

export function TodayCard() {
  const theme = useTheme();
  const c = theme.colors;
  const tasks = useStore((s) => s.tasks);
  const profile = useStore((s) => s.profileV2);
  const { openTodayFive } = useUI();

  const total = profile?.daily_task_goal ?? 3;
  const streak = profile?.current_streak ?? 0;

  const completedToday = tasks.filter(
    (t) =>
      t.status === 'done' &&
      isToday(t.sessions[t.sessions.length - 1]?.started_at),
  ).length;

  const investedToday = tasks
    .flatMap((t) => t.sessions)
    .filter((s) => isToday(s.started_at))
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);

  const estimateTotal = tasks
    .filter((t) => isToday(t.due_date) && t.status !== 'done')
    .reduce((sum, t) => sum + (t.estimated_seconds ?? 0), 0);

  const remaining = Math.max(0, estimateTotal - investedToday);
  const pct = total > 0 ? completedToday / total : 0;

  return (
    <Pressable
      onPress={openTodayFive}
      accessibilityRole="button"
      accessibilityLabel="Open Today's 5"
      style={({ pressed }) => ({
        marginTop: 16,
        marginHorizontal: 16,
        padding: 16,
        borderRadius: 16,
        backgroundColor: pressed ? c.elevation.level2 : c.elevation.level1,
        borderWidth: 1,
        borderColor: c.outlineVariant,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
      })}
    >
      <Ring
        pct={pct}
        ring={c.primary}
        track={c.elevation.level3}
        label={`${completedToday}/${total}`}
        labelColor={c.onSurface}
      />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ ...M3Type.titleMedium, color: c.onSurface }}>
          Today&apos;s goal
        </Text>
        <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant, marginTop: 2 }}>
          {fmtShort(investedToday)} invested
          {remaining > 0 ? ` · ${fmtShort(remaining)} to go` : ''}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 10,
          height: 28,
          borderRadius: 8,
          backgroundColor: c.tertiaryContainer,
        }}
      >
        <MaterialCommunityIcons
          name="fire"
          size={14}
          color={c.onTertiaryContainer}
        />
        <Text style={{ ...M3Type.labelLarge, color: c.onTertiaryContainer }}>
          {streak}
        </Text>
      </View>
    </Pressable>
  );
}
