import { useEffect, useMemo } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';

// Phase 7 step E — When You Work heatmap on mobile. RN port of the web
// WhenYouWorkCard. 7 rows × 24 hour cells. Mon-first display.
//
// Mobile bucketing is simplified vs web: sessions land entirely in their
// `started_at` cell (no overlap walking across hour/midnight boundaries).
// That's the same model the web endpoint used pre-Phase-6 hardening; for the
// directional-signal use case (which hour of which day are you most likely
// to be working) it's accurate enough. If precise bucketing matters, mobile
// can call the web endpoint via EXPO_PUBLIC_WEB_URL — wired up the same way
// the labels API is.

const DAY_RENDER_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun → store indexes
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SWATCH = ['#f3f4f6', '#d1d5db', '#9ca3af', '#4b5563', '#1a1a2e'];
const DARK_SWATCH = ['#2A2A30', '#3F3F46', '#71717A', '#A1A1AA', '#E4E4E7'];

const FONT = {
  m: 'WorkSans_500Medium',
  sb: 'WorkSans_600SemiBold',
  b: 'WorkSans_700Bold',
  xb: 'WorkSans_800ExtraBold',
};

function fmtHourLabel(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

function fmtDuration(sec: number): string {
  if (sec <= 0) return '0m';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

function intensityOf(seconds: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0 || max <= 0) return 0;
  const r = seconds / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

export function WhenYouWorkCard() {
  const theme = useTheme();
  const isDark = theme.dark;
  const swatch = isDark ? DARK_SWATCH : SWATCH;

  const range = useStore((s) => s.hourOfWeekRange);
  const setRange = useStore((s) => s.setHourOfWeekRange);
  const matrix = useStore((s) => s.hourOfWeekMatrix);
  const fetchHourOfWeek = useStore((s) => s.fetchHourOfWeek);

  useEffect(() => {
    void fetchHourOfWeek();
  }, [fetchHourOfWeek]);

  const summary = useMemo(() => {
    if (!matrix) return null;
    let max = 0;
    let topHour = -1;
    let topHourSec = 0;
    let secondHour = -1;
    let secondHourSec = 0;
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    let lateNight = 0;
    let total = 0;
    const hourTotals = new Array<number>(24).fill(0);

    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const v = matrix[d]?.[h] ?? 0;
        if (v > max) max = v;
        dayTotals[d] += v;
        hourTotals[h] += v;
        total += v;
        if (h >= 22) lateNight += v;
      }
    }
    for (let h = 0; h < 24; h++) {
      const v = hourTotals[h];
      if (v > topHourSec) {
        secondHour = topHour;
        secondHourSec = topHourSec;
        topHour = h;
        topHourSec = v;
      } else if (v > secondHourSec) {
        secondHour = h;
        secondHourSec = v;
      }
    }
    let topDay = -1;
    let topDaySec = 0;
    for (let d = 0; d < 7; d++) {
      if (dayTotals[d] > topDaySec) {
        topDay = d;
        topDaySec = dayTotals[d];
      }
    }
    return {
      max,
      total,
      topHour,
      topHourSec,
      secondHour,
      secondHourSec,
      topDay,
      topDaySec,
      lateNightPct: total > 0 ? Math.round((lateNight / total) * 100) : 0,
    };
  }, [matrix]);

  // Cell width derived from container width: 24 cells across with a 28px
  // label column on the left and 1px gaps between cells. Container has 18px
  // of padding inside the card.
  const screenW = Dimensions.get('window').width;
  // Card is full-width with the parent's 16px padding on each side, and the
  // card's own 14px internal padding. 24 cells + 23 gaps + label column.
  const innerW = screenW - 16 * 2 - 14 * 2;
  const cellW = Math.max(8, Math.floor((innerW - 28 - 23) / 24));

  const cardBg = isDark ? '#1B1B21' : '#fff';
  const cardBorder = isDark ? '#2E2D34' : '#e5e7eb';
  const inkText = isDark ? '#E4E1E9' : '#1a1a2e';
  const muted = isDark ? '#8A8698' : '#9ca3af';

  return (
    <View
      style={{
        backgroundColor: cardBg,
        borderColor: cardBorder,
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        marginTop: 14,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONT.b, fontSize: 14, color: inkText }}>
            When you work
          </Text>
          <Text style={{ fontFamily: FONT.m, fontSize: 11, color: muted, marginTop: 2 }}>
            Hour-of-week heatmap of tracked time
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: isDark ? '#25242A' : '#f3f4f6',
            borderColor: cardBorder,
            borderWidth: 1,
            borderRadius: 10,
            padding: 3,
            gap: 2,
          }}
        >
          {(['7d', '30d', '90d'] as const).map((r) => {
            const on = range === r;
            return (
              <Pressable
                key={r}
                onPress={() => setRange(r)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 7,
                  backgroundColor: on ? inkText : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: FONT.m,
                    color: on ? (isDark ? '#0C0B0A' : '#fff') : muted,
                  }}
                >
                  {r}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {!matrix ? (
        <Text
          style={{ fontSize: 12, color: muted, paddingVertical: 16, textAlign: 'center' }}
        >
          Loading heatmap…
        </Text>
      ) : summary && summary.total === 0 ? (
        <Text
          style={{ fontSize: 12, color: muted, paddingVertical: 16, textAlign: 'center' }}
        >
          No tracked time in this range yet.
        </Text>
      ) : (
        <>
          {/* Hour-label row above the grid */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 }}>
            <View style={{ width: 28 }} />
            {Array.from({ length: 24 }).map((_, h) => {
              const showLabel = h === 0 || h === 6 || h === 12 || h === 18;
              return (
                <View
                  key={h}
                  style={{
                    width: cellW,
                    marginLeft: h === 0 ? 0 : 1,
                    alignItems: 'flex-start',
                  }}
                >
                  {showLabel ? (
                    <Text
                      style={{
                        color: muted,
                        fontSize: 8,
                        fontFamily: FONT.m,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {fmtHourLabel(h)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* 7 day rows */}
          {DAY_RENDER_ORDER.map((dayIdx, rowIdx) => (
            <View
              key={dayIdx}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: rowIdx === 0 ? 0 : 2,
              }}
            >
              <Text
                style={{
                  width: 28,
                  color: muted,
                  fontSize: 9,
                  fontFamily: FONT.m,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                {DAY_LABELS[rowIdx]}
              </Text>
              {Array.from({ length: 24 }).map((_, h) => {
                const v = matrix[dayIdx]?.[h] ?? 0;
                const intensity = intensityOf(v, summary?.max ?? 0);
                return (
                  <View
                    key={h}
                    style={{
                      width: cellW,
                      height: 18,
                      backgroundColor: swatch[intensity],
                      borderRadius: 2,
                      marginLeft: h === 0 ? 0 : 1,
                    }}
                  />
                );
              })}
            </View>
          ))}

          {/* 4-stat summary footer */}
          {summary && (
            <View
              style={{
                flexDirection: 'row',
                marginTop: 14,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <SummaryStat
                label="Peak hour"
                value={summary.topHour >= 0 ? fmtHourLabel(summary.topHour) : '—'}
                sub={summary.topHour >= 0 ? fmtDuration(summary.topHourSec) : undefined}
                inkText={inkText}
                muted={muted}
              />
              <SummaryStat
                label="2nd peak"
                value={summary.secondHour >= 0 ? fmtHourLabel(summary.secondHour) : '—'}
                sub={summary.secondHour >= 0 ? fmtDuration(summary.secondHourSec) : undefined}
                inkText={inkText}
                muted={muted}
              />
              <SummaryStat
                label="Top day"
                value={
                  summary.topDay >= 0
                    ? DAY_LABELS[
                        DAY_RENDER_ORDER.indexOf(summary.topDay) >= 0
                          ? DAY_RENDER_ORDER.indexOf(summary.topDay)
                          : 0
                      ]
                    : '—'
                }
                sub={summary.topDay >= 0 ? fmtDuration(summary.topDaySec) : undefined}
                inkText={inkText}
                muted={muted}
              />
              <SummaryStat
                label="Late-night"
                value={`${summary.lateNightPct}%`}
                sub="after 10pm"
                inkText={inkText}
                muted={muted}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  inkText,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  inkText: string;
  muted: string;
}) {
  return (
    <View style={{ minWidth: 70 }}>
      <Text
        style={{
          fontFamily: FONT.m,
          fontSize: 9,
          color: muted,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: FONT.xb,
          fontSize: 14,
          color: inkText,
          marginTop: 1,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      {sub && (
        <Text
          style={{
            fontSize: 10,
            color: muted,
            marginTop: 1,
            fontVariant: ['tabular-nums'],
          }}
        >
          {sub}
        </Text>
      )}
    </View>
  );
}
