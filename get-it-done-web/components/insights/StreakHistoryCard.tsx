'use client';

import { useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';

// Spec § Daily Progress tab — last card. Line chart of last 12 weeks of
// streak length, peak callout, pulsing today marker.
//
// Pure SVG (no chart lib) so the styling matches the rest of Insights and
// keeps the bundle small. Replays the 15-min focus-session-per-day rule the
// trigger uses (see /api/insights/streak-history for details).

const W = 720;
const H = 160;
const PAD_TOP = 28;
const PAD_BOTTOM = 28;
const PAD_LEFT = 32;
const PAD_RIGHT = 16;

function formatShortDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD. Format as "Apr 7" without instantiating a Date in
  // a different tz than the user (we only display, no math).
  const [, m, d] = dateStr.split('-').map((p) => Number.parseInt(p, 10));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}`;
}

export function StreakHistoryCard() {
  const streakHistory = useStore((s) => s.streakHistory);
  const fetchStreakHistory = useStore((s) => s.fetchStreakHistory);

  useEffect(() => {
    void fetchStreakHistory();
  }, [fetchStreakHistory]);

  const chart = useMemo(() => {
    if (!streakHistory || streakHistory.days.length === 0) return null;
    const days = streakHistory.days;
    const maxStreak = Math.max(streakHistory.peakValue, 1);

    const innerW = W - PAD_LEFT - PAD_RIGHT;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const stepX = innerW / Math.max(1, days.length - 1);

    const xFor = (i: number) => PAD_LEFT + i * stepX;
    const yFor = (v: number) => PAD_TOP + innerH - (v / maxStreak) * innerH;

    // Build a path that breaks (M instead of L) on non-qualifying days so the
    // line shows gaps instead of dragging through zero.
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

    // Today marker = last day in the window.
    const todayIdx = days.length - 1;
    const todayDay = days[todayIdx];
    const todayPoint =
      todayDay && todayDay.qualified && todayDay.streak > 0
        ? { x: xFor(todayIdx), y: yFor(todayDay.streak), v: todayDay.streak }
        : null;

    // Peak point.
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

    // Weekly tick lines (every 7 days from the right edge).
    const ticks: { x: number; label: string }[] = [];
    for (let i = days.length - 1; i >= 0; i -= 14) {
      ticks.push({ x: xFor(i), label: formatShortDate(days[i].date) });
    }
    ticks.reverse();

    // Y-axis label values: 0, mid, max.
    const yMid = Math.round(maxStreak / 2);
    const yLabels = [
      { v: maxStreak, y: yFor(maxStreak) },
      { v: yMid, y: yFor(yMid) },
      { v: 0, y: yFor(0) },
    ];

    return { path: d, todayPoint, peakPoint, ticks, yLabels, maxStreak };
  }, [streakHistory]);

  return (
    <div
      className="rounded-[14px] p-[18px] mt-4"
      style={{ background: '#fff', border: '1px solid #e5e7eb' }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[15px] font-bold text-[#1a1a2e]">
            Streak history
          </div>
          <div className="text-[11px] text-[#9ca3af]">
            Last 12 weeks · 15-min focus session counts a day
          </div>
        </div>
        {streakHistory && streakHistory.peakValue > 0 && (
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af]">
              Peak
            </div>
            <div className="text-[15px] font-extrabold text-[#1a1a2e] tabular-nums">
              {streakHistory.peakValue}d
            </div>
          </div>
        )}
      </div>

      {!streakHistory ? (
        <div className="text-[12px] text-[#9ca3af] py-8 text-center">
          Loading streak history…
        </div>
      ) : chart === null || streakHistory.peakValue === 0 ? (
        <div className="text-[12px] text-[#9ca3af] py-8 text-center">
          No streak history yet. Run a 15-min focus session to start.
        </div>
      ) : (
        <>
          <style>{`
            @keyframes streakTodayPulse {
              0% { r: 4; opacity: 1; }
              60% { r: 11; opacity: 0; }
              100% { r: 11; opacity: 0; }
            }
          `}</style>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            preserveAspectRatio="none"
            style={{ display: 'block' }}
          >
            {/* gridlines */}
            {chart.yLabels.map((l) => (
              <line
                key={l.v}
                x1={PAD_LEFT}
                x2={W - PAD_RIGHT}
                y1={l.y}
                y2={l.y}
                stroke="#f3f4f6"
                strokeWidth={1}
              />
            ))}

            {/* y-axis labels */}
            {chart.yLabels.map((l) => (
              <text
                key={l.v}
                x={PAD_LEFT - 6}
                y={l.y + 3}
                textAnchor="end"
                fontSize={9}
                fontFamily="JetBrains Mono, monospace"
                fill="#9ca3af"
              >
                {l.v}
              </text>
            ))}

            {/* x-axis tick labels */}
            {chart.ticks.map((t) => (
              <text
                key={t.x}
                x={t.x}
                y={H - 8}
                textAnchor="middle"
                fontSize={9}
                fontFamily="JetBrains Mono, monospace"
                fill="#9ca3af"
              >
                {t.label}
              </text>
            ))}

            {/* line */}
            <path
              d={chart.path}
              fill="none"
              stroke="#1a1a2e"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* peak callout */}
            {chart.peakPoint && (
              <>
                <circle
                  cx={chart.peakPoint.x}
                  cy={chart.peakPoint.y}
                  r={3.5}
                  fill="#1a1a2e"
                />
                <text
                  x={chart.peakPoint.x}
                  y={chart.peakPoint.y - 9}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="#1a1a2e"
                >
                  {chart.peakPoint.v}d · {formatShortDate(chart.peakPoint.date)}
                </text>
              </>
            )}

            {/* today marker — pulsing ring + solid dot */}
            {chart.todayPoint && (
              <>
                <circle
                  cx={chart.todayPoint.x}
                  cy={chart.todayPoint.y}
                  r={4}
                  fill="rgba(26,26,46,0.18)"
                  style={{
                    transformOrigin: `${chart.todayPoint.x}px ${chart.todayPoint.y}px`,
                    animation: 'streakTodayPulse 1.6s ease-out infinite',
                  }}
                />
                <circle
                  cx={chart.todayPoint.x}
                  cy={chart.todayPoint.y}
                  r={4}
                  fill="#1a1a2e"
                />
              </>
            )}
          </svg>
        </>
      )}
    </div>
  );
}
