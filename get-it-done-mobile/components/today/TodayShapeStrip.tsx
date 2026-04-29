import { Text, View } from 'react-native';
import { TODAY_COLORS, TODAY_FONT } from './palette';

interface Props {
  completedToday: number;
  totalToday: number;
  investedSeconds: number;
  plannedSeconds: number;
  offPlanCount: number;
}

function formatInvested(secs: number): { value: string; unit: string } {
  if (secs < 60) return { value: String(secs), unit: 's' };
  const mins = Math.floor(secs / 60);
  if (mins < 60) return { value: String(mins), unit: 'm' };
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { value: `${h}h`, unit: `${m}m` };
}

function Cell({
  label,
  primary,
  secondary,
  fillPct,
  barColor,
}: {
  label: string;
  primary: string;
  secondary: string;
  fillPct: number;
  barColor: string;
}) {
  const safePct = Math.max(0, Math.min(100, fillPct));
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: TODAY_COLORS.card,
        borderWidth: 1,
        borderColor: TODAY_COLORS.border,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          fontFamily: TODAY_FONT.extrabold,
          fontSize: 9,
          letterSpacing: 0.8,
          color: TODAY_COLORS.ink3,
          textTransform: 'uppercase',
          marginBottom: 5,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text
          style={{
            fontFamily: TODAY_FONT.extrabold,
            fontSize: 17,
            letterSpacing: -0.4,
            color: TODAY_COLORS.ink,
            fontVariant: ['tabular-nums'],
          }}
        >
          {primary}
        </Text>
        {secondary.length > 0 && (
          <Text
            style={{
              fontFamily: TODAY_FONT.semibold,
              fontSize: 11,
              color: TODAY_COLORS.ink3,
              marginLeft: 2,
            }}
          >
            {secondary}
          </Text>
        )}
      </View>
      <View
        style={{
          height: 3,
          backgroundColor: TODAY_COLORS.chipBg,
          borderRadius: 2,
          marginTop: 7,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${safePct}%`,
            backgroundColor: barColor,
            borderRadius: 2,
          }}
        />
      </View>
    </View>
  );
}

export function TodayShapeStrip({
  completedToday,
  totalToday,
  investedSeconds,
  plannedSeconds,
  offPlanCount,
}: Props) {
  const donePct = totalToday > 0 ? (completedToday / totalToday) * 100 : 0;
  const investedPct =
    plannedSeconds > 0 ? (investedSeconds / plannedSeconds) * 100 : 0;
  const invested = formatInvested(investedSeconds);

  // Off-plan capped at 10 for bar scaling — any real off-plan activity is
  // worth flagging before it gets to 10.
  const offPlanPct = Math.min(100, (offPlanCount / 10) * 100);

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginBottom: 18,
        flexDirection: 'row',
        gap: 8,
      }}
    >
      <Cell
        label="Done"
        primary={String(completedToday)}
        secondary={`/${totalToday || 0}`}
        fillPct={donePct}
        barColor={TODAY_COLORS.green}
      />
      <Cell
        label="Invested"
        primary={invested.value}
        secondary={invested.unit}
        fillPct={investedPct}
        barColor={TODAY_COLORS.purple}
      />
      <Cell
        label="Off-plan"
        primary={String(offPlanCount)}
        secondary=""
        fillPct={offPlanPct}
        barColor={TODAY_COLORS.orange}
      />
    </View>
  );
}
