import { useEffect, useMemo } from 'react';
import { Dimensions, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';

// Phase 7 step E2 — RN port of the web Streak History chart. Pulls from the
// deployed web /api/insights/streak-history via lib/insights so the streak
// rule replay is single-sourced (server-authoritative).
//
// 12-week (84-day) line chart. Pure SVG. Peak callout sits above the highest
// streak day; today marker is a static SVG dot with an animated overlay
// (Reanimated) for the pulse.

const FONT = {
  m: 'WorkSans_500Medium',
  b: 'WorkSans_700Bold',
  xb: 'WorkSans_800ExtraBold',
};

function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map((p) => Number.parseInt(p, 10));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}`;
}

const PAD_TOP = 28;
const PAD_BOTTOM = 28;
const PAD_LEFT = 32;
const PAD_RIGHT = 16;
const H = 160;

export function StreakHistoryCard() {
  const theme = useTheme();
  const isDark = theme.dark;
  const cardBg = isDark ? '#1B1B21' : '#fff';
  const cardBorder = isDark ? '#2E2D34' : '#e5e7eb';
  const inkText = isDark ? '#E4E1E9' : '#1a1a2e';
  const muted = isDark ? '#8A8698' : '#9ca3af';
  const gridStroke = isDark ? '#2E2D34' : '#f3f4f6';
  // Line color: ink in light, white in dark (the spec calls for the streak
  // ring to always render on dark backgrounds, but here the card surface is
  // theme-driven so we follow it).
  const lineColor = isDark ? '#E4E1E9' : '#1a1a2e';

  const streakHistory = useStore((s) => s.streakHistory);
  const fetchStreakHistory = useStore((s) => s.fetchStreakHistory);

  useEffect(() => {
    void fetchStreakHistory();
  }, [fetchStreakHistory]);

  // Width derived from the screen — same calc as the heatmap card.
  const screenW = Dimensions.get('window').width;
  const cardOuterMargin = 16; // parent padding
  const cardInnerPadding = 14;
  const W = screenW - cardOuterMargin * 2 - cardInnerPadding * 2;

  const chart = useMemo(() => {
    if (!streakHistory || streakHistory.days.length === 0) return null;
    const days = streakHistory.days;
    const maxStreak = Math.max(streakHistory.peakValue, 1);

    const innerW = W - PAD_LEFT - PAD_RIGHT;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const stepX = innerW / Math.max(1, days.length - 1);

    const xFor = (i: number) => PAD_LEFT + i * stepX;
    const yFor = (v: number) => PAD_TOP + innerH - (v / maxStreak) * innerH;

    let d = '';
    let pendingMove = true;
    days.forEach((day, i) => {
      if (day.qualified && day.streak > 0) {
        const x = xFor(i);
        const y = yFor(day.streak);
        d += pendingMove ? `M${x.toFixed(1)},${y.toFixed(1)}` : ` L${x.toFixed(1)},${y.toFixed(1)}`;
        pendingMove = false;
      } else {
        pendingMove = true;
      }
    });

    const todayIdx = days.length - 1;
    const todayDay = days[todayIdx];
    const todayPoint =
      todayDay && todayDay.qualified && todayDay.streak > 0
        ? { x: xFor(todayIdx), y: yFor(todayDay.streak), v: todayDay.streak }
        : null;

    let peakPoint: { x: number; y: number; v: number; date: string } | null = null;
    if (streakHistory.peakDate && streakHistory.peakValue > 0) {
      const peakIdx = days.findIndex((day) => day.date === streakHistory.peakDate);
      if (peakIdx >= 0) {
        peakPoint = {
          x: xFor(peakIdx),
          y: yFor(streakHistory.peakValue),
          v: streakHistory.peakValue,
          date: streakHistory.peakDate,
        };
      }
    }

    const ticks: { x: number; label: string }[] = [];
    for (let i = days.length - 1; i >= 0; i -= 14) {
      ticks.push({ x: xFor(i), label: formatShortDate(days[i].date) });
    }
    ticks.reverse();

    const yMid = Math.round(maxStreak / 2);
    const yLabels = [
      { v: maxStreak, y: yFor(maxStreak) },
      { v: yMid, y: yFor(yMid) },
      { v: 0, y: yFor(0) },
    ];

    return { path: d, todayPoint, peakPoint, ticks, yLabels, maxStreak };
  }, [streakHistory, W]);

  // Reanimated pulse for the today marker. Worklet animation is GPU-driven,
  // unlike a setInterval/setState loop.
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!chart || !chart.todayPoint) return;
    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [chart, pulse]);

  const todayPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 1.8 }],
    opacity: 0.5 - pulse.value * 0.5,
  }));

  return (
    <View
      style={{
        backgroundColor: cardBg,
        borderColor: cardBorder,
        borderWidth: 1,
        borderRadius: 14,
        padding: cardInnerPadding,
        marginTop: 14,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONT.b, fontSize: 14, color: inkText }}>
            Streak history
          </Text>
          <Text style={{ fontFamily: FONT.m, fontSize: 11, color: muted, marginTop: 2 }}>
            Last 12 weeks · 15-min focus session counts a day
          </Text>
        </View>
        {streakHistory && streakHistory.peakValue > 0 && (
          <View>
            <Text
              style={{
                fontFamily: FONT.m,
                fontSize: 9,
                color: muted,
                letterSpacing: 1,
                textTransform: 'uppercase',
                textAlign: 'right',
              }}
            >
              Peak
            </Text>
            <Text
              style={{
                fontFamily: FONT.xb,
                fontSize: 14,
                color: inkText,
                fontVariant: ['tabular-nums'],
                textAlign: 'right',
              }}
            >
              {streakHistory.peakValue}d
            </Text>
          </View>
        )}
      </View>

      {!streakHistory ? (
        <Text
          style={{ fontSize: 12, color: muted, paddingVertical: 30, textAlign: 'center' }}
        >
          Loading streak history…
        </Text>
      ) : chart === null || streakHistory.peakValue === 0 ? (
        <Text
          style={{ fontSize: 12, color: muted, paddingVertical: 30, textAlign: 'center' }}
        >
          No streak history yet. Run a 15-min focus session to start.
        </Text>
      ) : (
        <View style={{ width: W, height: H, position: 'relative' }}>
          <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            {/* Gridlines */}
            {chart.yLabels.map((l) => (
              <Line
                key={`grid-${l.v}`}
                x1={PAD_LEFT}
                x2={W - PAD_RIGHT}
                y1={l.y}
                y2={l.y}
                stroke={gridStroke}
                strokeWidth={1}
              />
            ))}

            {/* Y-axis labels */}
            {chart.yLabels.map((l) => (
              <SvgText
                key={`yl-${l.v}`}
                x={PAD_LEFT - 6}
                y={l.y + 3}
                textAnchor="end"
                fontSize={9}
                fill={muted}
                fontWeight="500"
              >
                {l.v}
              </SvgText>
            ))}

            {/* X-axis tick labels */}
            {chart.ticks.map((t) => (
              <SvgText
                key={`xt-${t.x}`}
                x={t.x}
                y={H - 8}
                textAnchor="middle"
                fontSize={9}
                fill={muted}
                fontWeight="500"
              >
                {t.label}
              </SvgText>
            ))}

            {/* Line */}
            <Path
              d={chart.path}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Peak callout */}
            {chart.peakPoint && (
              <>
                <Circle
                  cx={chart.peakPoint.x}
                  cy={chart.peakPoint.y}
                  r={3.5}
                  fill={lineColor}
                />
                <SvgText
                  x={chart.peakPoint.x}
                  y={chart.peakPoint.y - 9}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="700"
                  fill={inkText}
                >
                  {chart.peakPoint.v}d · {formatShortDate(chart.peakPoint.date)}
                </SvgText>
              </>
            )}

            {/* Today marker — solid dot in the SVG layer. The pulsing ring
                lives in an absolutely-positioned Animated.View overlay below
                because react-native-svg's <Animated.Circle> path requires
                `createAnimatedComponent` boilerplate that's noisier. */}
            {chart.todayPoint && (
              <Circle
                cx={chart.todayPoint.x}
                cy={chart.todayPoint.y}
                r={4}
                fill={lineColor}
              />
            )}
          </Svg>

          {/* Pulsing ring overlay for today's point. Positioned absolutely in
              the parent View at the same x/y as the SVG dot. */}
          {chart.todayPoint && (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  left: chart.todayPoint.x - 4,
                  top: chart.todayPoint.y - 4,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: lineColor,
                },
                todayPulseStyle,
              ]}
            />
          )}
        </View>
      )}
    </View>
  );
}
