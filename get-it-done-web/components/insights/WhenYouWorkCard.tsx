'use client';

import { useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { fmtShort } from '@/lib/utils';

// Spec § "When you work" — 7×24 hour-of-week heatmap. Pulls from
// /api/sessions/by-hour-of-week (existing endpoint). API indexes day
// 0=Sun..6=Sat (JS Date.getDay()); spec asks for Mon-first display, so the
// rendering order is [Mon, Tue, Wed, Thu, Fri, Sat, Sun] = [1,2,3,4,5,6,0].

const DAY_RENDER_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun → API indexes
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_LABEL_SLOTS = [0, 4, 8, 12, 16, 20]; // 12a · 4a · 8a · 12p · 4p · 8p

function fmtHourLabel(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

// Bucket a cell's seconds into 0..4 against the matrix's max non-zero value.
// Empty cell = 0 (rendered as the lightest swatch). Above 0 we split the
// remaining range into 4 quartiles.
function intensityOf(seconds: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0 || max <= 0) return 0;
  const r = seconds / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

const SWATCH = ['#f3f4f6', '#d1d5db', '#9ca3af', '#4b5563', '#1a1a2e'];

export function WhenYouWorkCard() {
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
    let lateNight = 0; // seconds from 22:00..23:59 (after 10pm)
    let total = 0;

    // Sum hour-of-week (across all days) so the "peak hour" is the hour-of-day
    // not a single (day,hour) cell. That matches Komal's "Wed 9pm-11pm" example
    // intent better than naming a single cell.
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

  return (
    <div
      className="rounded-[14px] p-[18px] mt-4"
      style={{ background: '#fff', border: '1px solid #e5e7eb' }}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div>
          <div className="text-[15px] font-bold text-[#1a1a2e]">
            When you work
          </div>
          <div className="text-[11px] text-[#9ca3af]">
            Hour-of-week heatmap of tracked time
          </div>
        </div>
        <div className="ml-auto inline-flex rounded-[10px] p-[3px] bg-[#f3f4f6] border border-[#e5e7eb]">
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-[10px] py-[4px] text-[11px] font-medium rounded-[7px] cursor-pointer border-0"
              style={{
                background: range === r ? '#1a1a2e' : 'transparent',
                color: range === r ? '#fff' : '#5b5674',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {!matrix ? (
        <div className="text-[12px] text-[#9ca3af] py-4 text-center">
          Loading heatmap…
        </div>
      ) : summary && summary.total === 0 ? (
        <div className="text-[12px] text-[#9ca3af] py-4 text-center">
          No tracked time in this range yet.
        </div>
      ) : (
        <>
          {/* Hour-label row above the grid. 24 cells; only the multiples of 4
              show a label. Labels are anchored at column start. */}
          <div
            className="grid items-end mb-1"
            style={{
              gridTemplateColumns: '36px repeat(24, minmax(0, 1fr))',
              gap: 2,
            }}
          >
            <div />
            {Array.from({ length: 24 }).map((_, h) => (
              <div
                key={h}
                className="text-[9px] font-mono text-[#9ca3af] text-left tabular-nums"
                style={{ visibility: HOUR_LABEL_SLOTS.includes(h) ? 'visible' : 'hidden' }}
              >
                {fmtHourLabel(h)}
              </div>
            ))}
          </div>

          {/* Grid: 7 rows (Mon..Sun) × 24 hour cells, 36px label column on the
              left. Each cell is 22px tall per spec. */}
          <div className="flex flex-col gap-[2px]">
            {DAY_RENDER_ORDER.map((dayIdx, rowIdx) => (
              <div
                key={dayIdx}
                className="grid items-stretch"
                style={{
                  gridTemplateColumns: '36px repeat(24, minmax(0, 1fr))',
                  gap: 2,
                }}
              >
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] flex items-center">
                  {DAY_LABELS[rowIdx]}
                </div>
                {Array.from({ length: 24 }).map((_, h) => {
                  const v = matrix[dayIdx]?.[h] ?? 0;
                  const intensity = intensityOf(v, summary?.max ?? 0);
                  return (
                    <div
                      key={h}
                      className="rounded-[3px]"
                      style={{
                        height: 22,
                        background: SWATCH[intensity],
                      }}
                      title={
                        v > 0
                          ? `${DAY_LABELS[rowIdx]} ${fmtHourLabel(h)}–${fmtHourLabel((h + 1) % 24)} · ${fmtShort(v)}`
                          : `${DAY_LABELS[rowIdx]} ${fmtHourLabel(h)} · no work`
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* 4-column summary footer per spec */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <SummaryStat
                label="Peak hour"
                value={summary.topHour >= 0 ? fmtHourLabel(summary.topHour) : '—'}
                sub={summary.topHour >= 0 ? fmtShort(summary.topHourSec) : undefined}
              />
              <SummaryStat
                label="2nd peak"
                value={summary.secondHour >= 0 ? fmtHourLabel(summary.secondHour) : '—'}
                sub={summary.secondHour >= 0 ? fmtShort(summary.secondHourSec) : undefined}
              />
              <SummaryStat
                label="Most focused day"
                value={
                  summary.topDay >= 0
                    ? DAY_LABELS[
                        DAY_RENDER_ORDER.indexOf(summary.topDay) >= 0
                          ? DAY_RENDER_ORDER.indexOf(summary.topDay)
                          : 0
                      ]
                    : '—'
                }
                sub={summary.topDay >= 0 ? fmtShort(summary.topDaySec) : undefined}
              />
              <SummaryStat
                label="Late-night ratio"
                value={`${summary.lateNightPct}%`}
                sub="after 10pm"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af]">
        {label}
      </div>
      <div className="text-[16px] font-extrabold text-[#1a1a2e] mt-[1px] tabular-nums">
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-[#888] mt-[1px] tabular-nums">{sub}</div>
      )}
    </div>
  );
}
