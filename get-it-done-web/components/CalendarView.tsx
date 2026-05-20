'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { CalendarTargetEditor } from './CalendarTargetEditor';
import { fmtShort, todayISO } from '@/lib/utils';
import type { WeeklyGoal } from '@/types';

// Phase 6 — Calendar redesign + weekly goal as primary unit.
//
// Layout:
//   • Left  (~60%)  compact month grid with the new ring color scheme
//   • Right (~40%)  three stacked panels: This Week / Daily Goal / Selected Day
//
// Ring color rules (NOT the legacy CalendarDay):
//   - Empty grey outline:  0 minutes
//   - Purple:              1 min — just below (daily_goal − 30min)
//   - Green ("good zone"): daily_goal − 30min  to  daily_goal + 60min
//   - Red:                 more than daily_goal + 60min
// The green window is a FIXED 90-min band around the daily goal, not a %.
//
// Per-week goals live in `weekly_goals` (migration 0033). The legacy
// per-weekday `daily_targets` system is preserved but hidden behind a
// "Per-weekday →" expander on the Daily Goal card per the brief.

const DEFAULT_WEEKLY_GOAL_HOURS = 40;
const DEFAULT_WORKING_DAYS = 5;

export function CalendarView() {
  const userId = useStore((s) => s.userId);
  const weeklyGoals = useStore((s) => s.weeklyGoals);
  const fetchWeeklyGoals = useStore((s) => s.fetchWeeklyGoals);
  const setWeeklyGoal = useStore((s) => s.setWeeklyGoal);
  const dailyTargets = useStore((s) => s.dailyTargets);
  const fetchDailyTargets = useStore((s) => s.fetchDailyTargets);
  const secondsByDay = useStore((s) => s.secondsByDay);
  const fetchSessionsByDay = useStore((s) => s.fetchSessionsByDay);
  const prefs = useStore((s) => s.prefs);

  // Sample "today" once on mount via lazy useState — React 19 purity rule
  // says no Date.now() during render. A snapshot is fine; the month view
  // shouldn't relabel itself at midnight without a reload.
  const [todayMidnightMs] = useState<number>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });
  const todayStr = todayISO();

  // The displayed month for the grid.
  const [monthStart, setMonthStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // The "This Week" panel is paged separately from the grid so the user can
  // scroll back a few weeks without losing their place in the month.
  const [thisWeekStart, setThisWeekStart] = useState<Date>(() => sundayOf(new Date()));

  // The Selected Day panel — defaults to today.
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const selectedKey = ymd(selectedDay);

  // Per-weekday goal expander state (hidden by default per the brief).
  const [perWeekdayOpen, setPerWeekdayOpen] = useState(false);

  // Initial data fetches.
  useEffect(() => {
    if (!userId) return;
    if (!dailyTargets) void fetchDailyTargets();
  }, [userId, dailyTargets, fetchDailyTargets]);

  // Fetch the session bucket whenever the visible month changes. Padded ±5
  // weeks so the right-column "This Week" pagination has data on hand.
  useEffect(() => {
    if (!userId) return;
    const fromDate = new Date(monthStart);
    fromDate.setDate(monthStart.getDate() - 35);
    const toDate = new Date(monthStart);
    toDate.setMonth(monthStart.getMonth() + 1);
    toDate.setDate(7);
    void fetchSessionsByDay(ymd(fromDate), ymd(toDate));
  }, [userId, monthStart, fetchSessionsByDay]);

  // Fetch weekly_goals for the visible window + a buffer so jumping back a
  // week or two doesn't trigger another round trip.
  useEffect(() => {
    if (!userId) return;
    const from = new Date(monthStart);
    from.setDate(monthStart.getDate() - 70);
    const to = new Date(monthStart);
    to.setDate(monthStart.getDate() + 70);
    void fetchWeeklyGoals(ymd(sundayOf(from)), ymd(sundayOf(to)));
  }, [userId, monthStart, fetchWeeklyGoals]);

  // --- Goal resolution chain --------------------------------------------
  // For any date, find the weekly_goals row whose week_start matches the
  // date's Sunday. If missing, fall back to the most recent past row,
  // then to user_preferences.weekly_work_goal_hours, then 40h. Working
  // days follows the same chain (default 5).
  const recentPastGoal = useMemo<WeeklyGoal | null>(() => {
    const all = Object.values(weeklyGoals);
    if (all.length === 0) return null;
    const todayKey = todayISO();
    const past = all.filter((g) => g.week_start <= todayKey);
    if (past.length === 0) return null;
    past.sort((a, b) => b.week_start.localeCompare(a.week_start));
    return past[0];
  }, [weeklyGoals]);

  const resolveGoalForDate = (date: Date): { goalHours: number; workingDays: number; source: 'week' | 'recent' | 'prefs' | 'default' } => {
    const wkKey = ymd(sundayOf(date));
    const exact = weeklyGoals[wkKey];
    if (exact) {
      return {
        goalHours: Number(exact.goal_hours),
        workingDays: exact.working_days,
        source: 'week',
      };
    }
    if (recentPastGoal) {
      return {
        goalHours: Number(recentPastGoal.goal_hours),
        workingDays: recentPastGoal.working_days,
        source: 'recent',
      };
    }
    if (prefs?.weekly_work_goal_hours) {
      return {
        goalHours: prefs.weekly_work_goal_hours,
        workingDays: DEFAULT_WORKING_DAYS,
        source: 'prefs',
      };
    }
    return {
      goalHours: DEFAULT_WEEKLY_GOAL_HOURS,
      workingDays: DEFAULT_WORKING_DAYS,
      source: 'default',
    };
  };

  const thisWeekGoal = resolveGoalForDate(thisWeekStart);

  // --- Layout --------------------------------------------------------------
  const monthLabel = useMemo(
    () =>
      monthStart.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [monthStart],
  );

  if (!dailyTargets) {
    return (
      <div className="text-center py-10 text-[#aaa] text-sm">
        Loading calendar…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
      {/* LEFT 60% — month grid */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setMonthStart(addMonths(monthStart, -1))}
            className="text-xs px-2 py-1 rounded-md border-[1.5px] border-[#e5e7eb] bg-white cursor-pointer hover:border-[#1a1a2e] transition-colors"
            aria-label="Previous month"
          >
            ←
          </button>
          <span className="text-[14px] font-extrabold text-[#1a1a2e]">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setMonthStart(addMonths(monthStart, 1))}
            className="text-xs px-2 py-1 rounded-md border-[1.5px] border-[#e5e7eb] bg-white cursor-pointer hover:border-[#1a1a2e] transition-colors"
            aria-label="Next month"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              d.setDate(1);
              d.setHours(0, 0, 0, 0);
              setMonthStart(d);
            }}
            className="ml-2 text-[11px] text-[#888] underline cursor-pointer bg-transparent border-0 hover:text-[#1a1a2e]"
          >
            today
          </button>
        </div>

        <MonthGridV2
          monthStart={monthStart}
          todayMidnightMs={todayMidnightMs}
          secondsByDay={secondsByDay}
          onPickDay={(d) => {
            setSelectedDay(d);
            // Jumping to a day in another week pages the This Week card too.
            setThisWeekStart(sundayOf(d));
          }}
          resolveGoalForDate={resolveGoalForDate}
        />

        <CalendarLegendV2 />

        {/* Hidden advanced editor for per-weekday goals. Click the link to
            reveal the legacy CalendarTargetEditor inline. */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setPerWeekdayOpen((v) => !v)}
            className="text-[11px] text-[#666] hover:text-[#1a1a2e] underline bg-transparent border-0 cursor-pointer"
          >
            {perWeekdayOpen ? '↑ Hide per-weekday goals' : 'Per-weekday goals →'}
          </button>
          <div className="text-[10px] text-[#9ca3af] mt-[2px]">
            Advanced — override individual weekdays. Most users only need the
            weekly goal on the right.
          </div>
          {perWeekdayOpen && (
            <div className="mt-2">
              <CalendarTargetEditor targets={dailyTargets} />
            </div>
          )}
        </div>
      </div>

      {/* RIGHT 40% — stacked panels */}
      <div className="flex flex-col gap-3">
        <ThisWeekPanel
          thisWeekStart={thisWeekStart}
          setThisWeekStart={setThisWeekStart}
          secondsByDay={secondsByDay}
          todayMidnightMs={todayMidnightMs}
          goal={thisWeekGoal}
          weeklyGoals={weeklyGoals}
          onSetGoal={(weekStart, hours, days) =>
            setWeeklyGoal(weekStart, hours, days)
          }
        />
        <DailyGoalPanel
          weeklyGoalHours={thisWeekGoal.goalHours}
          workingDays={thisWeekGoal.workingDays}
          thisWeekStart={thisWeekStart}
          todayMidnightMs={todayMidnightMs}
          onChange={(hours, days) =>
            setWeeklyGoal(ymd(thisWeekStart), hours, days)
          }
        />
        <SelectedDayPanel
          date={selectedDay}
          secondsLogged={secondsByDay[selectedKey] ?? 0}
          dailyGoalHours={thisWeekGoal.goalHours / thisWeekGoal.workingDays}
          todayMidnightMs={todayMidnightMs}
          isToday={selectedKey === todayStr}
        />
      </div>
    </div>
  );
}

// ----- New ring color scheme (fixed-width green band) --------------------

type RingColor = 'empty' | 'purple' | 'green' | 'red';

// Brief's exact rule: green = daily_goal - 30min  …  daily_goal + 60min.
// All thresholds in hours. A daily goal of 0 means "rest day" — anything
// logged paints purple (bonus), nothing logged stays empty.
function ringColorFor(hours: number, dailyGoalHours: number): RingColor {
  if (hours <= 0) return 'empty';
  if (dailyGoalHours <= 0) return 'purple'; // rest-day bonus
  const lo = dailyGoalHours - 0.5;
  const hi = dailyGoalHours + 1.0;
  if (hours > hi) return 'red';
  if (hours >= lo) return 'green';
  return 'purple';
}

const RING_COLOR_HEX: Record<RingColor, string> = {
  empty: '#d1d5db',
  purple: '#a855f7',
  green: '#10b981',
  red: '#ef4444',
};

// ----- Month grid using the new ring colors -----------------------------

function MonthGridV2({
  monthStart,
  todayMidnightMs,
  secondsByDay,
  onPickDay,
  resolveGoalForDate,
}: {
  monthStart: Date;
  todayMidnightMs: number;
  secondsByDay: Record<string, number>;
  onPickDay: (d: Date) => void;
  resolveGoalForDate: (date: Date) => {
    goalHours: number;
    workingDays: number;
    source: string;
  };
}) {
  const cells: { date: Date; inMonth: boolean }[] = [];
  const firstCell = new Date(monthStart);
  firstCell.setDate(monthStart.getDate() - monthStart.getDay());
  for (let i = 0; i < 42; i++) {
    const d = new Date(firstCell);
    d.setDate(firstCell.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === monthStart.getMonth() });
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: '#1a1a2e',
        color: '#fff',
        boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
      }}
    >
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-mono uppercase tracking-wider text-white/45"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const key = ymd(cell.date);
          const seconds = secondsByDay[key] ?? 0;
          const hours = seconds / 3600;
          const { goalHours, workingDays } = resolveGoalForDate(cell.date);
          const dailyGoal = workingDays > 0 ? goalHours / workingDays : 0;
          const isFuture = cell.date.getTime() > todayMidnightMs;
          const isToday = cell.date.getTime() === todayMidnightMs;
          return (
            <DayCellV2
              key={key}
              date={cell.date}
              inMonth={cell.inMonth}
              isToday={isToday}
              isFuture={isFuture}
              hours={hours}
              dailyGoalHours={dailyGoal}
              onClick={() => onPickDay(cell.date)}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayCellV2({
  date,
  inMonth,
  isToday,
  isFuture,
  hours,
  dailyGoalHours,
  onClick,
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  hours: number;
  dailyGoalHours: number;
  onClick: () => void;
}) {
  const color = isFuture ? 'empty' : ringColorFor(hours, dailyGoalHours);
  const dim = !inMonth;

  // Visual arc length. The brief says "tiny slivers always render". Floor at
  // a small minimum so 5 min still paints a visible nub.
  const visualRatio =
    dailyGoalHours > 0
      ? Math.min(1.0, hours / Math.max(0.01, dailyGoalHours))
      : hours > 0
        ? 1
        : 0;
  const minPaint = hours > 0 ? 0.08 : 0;
  const finalRatio = Math.max(visualRatio, minPaint);

  const R = 16;
  const C = 2 * Math.PI * R;
  const dashOffset = C * (1 - finalRatio);

  const showRing = hours > 0 && !isFuture;
  const hex = RING_COLOR_HEX[color];

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square rounded-md flex items-center justify-center bg-transparent border-0 cursor-pointer transition-transform hover:scale-105"
      style={{
        opacity: dim ? 0.4 : 1,
        outline: isToday ? '1.5px solid #fff' : 'none',
        outlineOffset: 1,
      }}
      title={
        isFuture
          ? `Future · target ${dailyGoalHours.toFixed(1)}h`
          : `${hours.toFixed(1)}h logged · target ${dailyGoalHours.toFixed(1)}h`
      }
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 w-full h-full">
        {/* Empty outline always renders so the cell has a visible frame
            even on days with zero data. */}
        <circle
          cx={22}
          cy={22}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1.5}
        />
        {showRing && (
          <circle
            cx={22}
            cy={22}
            r={R}
            fill="none"
            stroke={hex}
            strokeWidth={color === 'red' ? 3 : 2.5}
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
            style={{
              filter:
                color === 'red'
                  ? 'drop-shadow(0 0 4px rgba(239,68,68,0.6))'
                  : color === 'green'
                    ? 'drop-shadow(0 0 3px rgba(16,185,129,0.5))'
                    : undefined,
            }}
          />
        )}
      </svg>
      <span
        className="relative z-[1] font-mono text-[11px]"
        style={{
          color: '#fff',
          fontWeight: isToday ? 800 : 600,
          textShadow: showRing ? '0 0 3px rgba(0,0,0,0.6)' : undefined,
        }}
      >
        {date.getDate()}
      </span>
    </button>
  );
}

function CalendarLegendV2() {
  return (
    <div className="flex flex-wrap items-center gap-3 mt-3">
      <span className="text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af]">
        Legend
      </span>
      <LegendChip color="#d1d5db" label="No data" />
      <LegendChip color="#a855f7" label="Working" />
      <LegendChip color="#10b981" label="Goal hit" />
      <LegendChip color="#ef4444" label="Overworked" />
      <span className="text-[10px] text-[#9ca3af] italic">
        Green = daily goal ±90 min window
      </span>
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-[6px] text-[11px] text-[#666]">
      <svg viewBox="0 0 16 16" className="w-3 h-3">
        <circle
          cx={8}
          cy={8}
          r={6}
          fill="none"
          stroke={color}
          strokeWidth={2}
        />
      </svg>
      {label}
    </span>
  );
}

// ----- Right column panels ---------------------------------------------

function ThisWeekPanel({
  thisWeekStart,
  setThisWeekStart,
  secondsByDay,
  todayMidnightMs,
  goal,
  weeklyGoals,
  onSetGoal,
}: {
  thisWeekStart: Date;
  setThisWeekStart: (d: Date) => void;
  secondsByDay: Record<string, number>;
  todayMidnightMs: number;
  goal: { goalHours: number; workingDays: number; source: string };
  weeklyGoals: Record<string, WeeklyGoal>;
  onSetGoal: (
    weekStart: string,
    hours: number,
    days: number,
  ) => Promise<WeeklyGoal | null>;
}) {
  // Sum the seven days. Today is included up through whatever has been logged
  // so far. The grid uses `secondsByDay` for both — they stay in sync.
  let weekSeconds = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(thisWeekStart);
    d.setDate(thisWeekStart.getDate() + i);
    weekSeconds += secondsByDay[ymd(d)] ?? 0;
  }
  const weekHours = weekSeconds / 3600;

  const weekEnd = new Date(thisWeekStart);
  weekEnd.setDate(thisWeekStart.getDate() + 6);
  weekEnd.setHours(0, 0, 0, 0);

  const isCurrentWeek =
    thisWeekStart.getTime() <= todayMidnightMs &&
    todayMidnightMs <= weekEnd.getTime();
  const isPast = weekEnd.getTime() < todayMidnightMs;
  const isFuture = thisWeekStart.getTime() > todayMidnightMs;

  // Past-week locking — if the week is past AND has a stored goal, the input
  // is read-only. New users with no stored goal can still set one (we want
  // backfill to be possible). Future weeks are always editable so the user
  // can plan ahead.
  const stored = weeklyGoals[ymd(thisWeekStart)];
  const lockEditing = isPast && !!stored;

  const pct = goal.goalHours > 0 ? (weekHours / goal.goalHours) * 100 : 0;

  // Local controlled input — flushed on blur so each keystroke doesn't write
  // to DB. We also save on Enter for power users.
  const [draft, setDraft] = useState<string>(goal.goalHours.toFixed(1));
  // Reset draft when we navigate to a different week.
  const [prevWeekKey, setPrevWeekKey] = useState<string>(ymd(thisWeekStart));
  const wkKey = ymd(thisWeekStart);
  if (wkKey !== prevWeekKey) {
    setPrevWeekKey(wkKey);
    setDraft(goal.goalHours.toFixed(1));
  }

  const handleCommit = async () => {
    if (lockEditing) return;
    const num = Number(draft);
    if (!Number.isFinite(num) || num < 0 || num > 168) {
      setDraft(goal.goalHours.toFixed(1));
      return;
    }
    if (Math.abs(num - goal.goalHours) < 0.01) return;
    await onSetGoal(wkKey, Number(num.toFixed(1)), goal.workingDays);
  };

  return (
    <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] flex items-center gap-2">
            This week
            {isCurrentWeek && (
              <span className="text-[9px] font-bold tracking-[0.5px] px-[5px] py-[1px] rounded bg-[#1a1a2e] text-white">
                CURRENT
              </span>
            )}
            {isPast && (
              <span
                className="text-[9px] font-bold tracking-[0.5px] px-[5px] py-[1px] rounded"
                style={{ background: '#fef3c7', color: '#78350f' }}
                title={
                  lockEditing
                    ? 'Past weeks are locked to preserve Honest Score'
                    : 'No goal was recorded for this week'
                }
              >
                {lockEditing ? 'PAST · closed' : 'PAST'}
              </span>
            )}
            {isFuture && (
              <span
                className="text-[9px] font-bold tracking-[0.5px] px-[5px] py-[1px] rounded"
                style={{ background: '#dbeafe', color: '#1e40af' }}
              >
                UPCOMING
              </span>
            )}
          </div>
          <div className="text-[13px] font-extrabold text-[#1a1a2e] mt-[2px]">
            {weekRangeLabel(thisWeekStart)}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const d = new Date(thisWeekStart);
              d.setDate(d.getDate() - 7);
              setThisWeekStart(d);
            }}
            className="text-xs px-2 py-1 rounded-md border-[1.5px] border-[#e5e7eb] bg-white cursor-pointer hover:border-[#1a1a2e]"
            aria-label="Previous week"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date(thisWeekStart);
              d.setDate(d.getDate() + 7);
              setThisWeekStart(d);
            }}
            className="text-xs px-2 py-1 rounded-md border-[1.5px] border-[#e5e7eb] bg-white cursor-pointer hover:border-[#1a1a2e]"
            aria-label="Next week"
          >
            →
          </button>
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[28px] font-extrabold text-[#1a1a2e] tabular-nums">
          {weekHours.toFixed(1)}h
        </span>
        <span className="text-[12px] text-[#9ca3af]">
          of{' '}
          <input
            type="number"
            min={0}
            max={168}
            step={0.5}
            value={draft}
            disabled={lockEditing}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCommit();
              if (e.key === 'Escape') setDraft(goal.goalHours.toFixed(1));
            }}
            className="w-[56px] text-right font-bold text-[#1a1a2e] bg-transparent outline-none border-b-[1.5px] border-transparent hover:border-[#e5e7eb] focus:border-[#1a1a2e] disabled:cursor-not-allowed"
          />
          h goal
        </span>
      </div>

      <div
        className="rounded-full h-[6px] overflow-hidden mb-2"
        style={{ background: 'rgba(0,0,0,0.06)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: pct > 110 ? '#ef4444' : pct >= 90 ? '#10b981' : '#1a1a2e',
          }}
        />
      </div>

      <div className="text-[11px] text-[#9ca3af]">
        {pct.toFixed(0)}% of weekly goal
        {goal.source !== 'week' && !lockEditing && (
          <span className="ml-2 italic">
            (using{' '}
            {goal.source === 'recent'
              ? 'most recent goal'
              : goal.source === 'prefs'
                ? 'legacy weekly goal'
                : 'default 40h'}
            )
          </span>
        )}
      </div>
    </div>
  );
}

function DailyGoalPanel({
  weeklyGoalHours,
  workingDays,
  thisWeekStart,
  todayMidnightMs,
  onChange,
}: {
  weeklyGoalHours: number;
  workingDays: number;
  thisWeekStart: Date;
  todayMidnightMs: number;
  onChange: (
    weeklyHours: number,
    workingDays: number,
  ) => Promise<WeeklyGoal | null>;
}) {
  const dailyHours = workingDays > 0 ? weeklyGoalHours / workingDays : 0;
  const weekEnd = new Date(thisWeekStart);
  weekEnd.setDate(thisWeekStart.getDate() + 6);
  const isPast = weekEnd.getTime() < todayMidnightMs;

  const [dailyDraft, setDailyDraft] = useState<string>(dailyHours.toFixed(1));
  const [daysDraft, setDaysDraft] = useState<string>(String(workingDays));
  // Reset on week or upstream-value change.
  const [prevKey, setPrevKey] = useState<string>(
    `${ymd(thisWeekStart)}|${weeklyGoalHours}|${workingDays}`,
  );
  const k = `${ymd(thisWeekStart)}|${weeklyGoalHours}|${workingDays}`;
  if (k !== prevKey) {
    setPrevKey(k);
    setDailyDraft(dailyHours.toFixed(1));
    setDaysDraft(String(workingDays));
  }

  const handleDailyCommit = async () => {
    if (isPast) return;
    const num = Number(dailyDraft);
    if (!Number.isFinite(num) || num < 0 || num > 24) {
      setDailyDraft(dailyHours.toFixed(1));
      return;
    }
    const days = Number(daysDraft) || workingDays;
    const newWeekly = Number((num * days).toFixed(1));
    if (Math.abs(newWeekly - weeklyGoalHours) < 0.01) return;
    await onChange(newWeekly, days);
  };

  const handleDaysCommit = async () => {
    if (isPast) return;
    const num = Number(daysDraft);
    if (!Number.isInteger(num) || num < 1 || num > 7) {
      setDaysDraft(String(workingDays));
      return;
    }
    if (num === workingDays) return;
    // Daily target stays fixed when working_days changes — recompute weekly.
    const newWeekly = Number((dailyHours * num).toFixed(1));
    await onChange(newWeekly, num);
  };

  return (
    <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-2">
        Daily goal
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <input
          type="number"
          min={0}
          max={24}
          step={0.5}
          value={dailyDraft}
          disabled={isPast}
          onChange={(e) => setDailyDraft(e.target.value)}
          onBlur={handleDailyCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleDailyCommit();
            if (e.key === 'Escape') setDailyDraft(dailyHours.toFixed(1));
          }}
          className="text-[28px] font-extrabold text-[#1a1a2e] tabular-nums w-[80px] bg-transparent outline-none border-b-[1.5px] border-transparent hover:border-[#e5e7eb] focus:border-[#1a1a2e] disabled:cursor-not-allowed"
        />
        <span className="text-[14px] text-[#9ca3af]">h / day</span>
      </div>

      <div className="text-[11px] text-[#6b7280] mb-2">
        across{' '}
        <input
          type="number"
          min={1}
          max={7}
          step={1}
          value={daysDraft}
          disabled={isPast}
          onChange={(e) => setDaysDraft(e.target.value)}
          onBlur={handleDaysCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleDaysCommit();
            if (e.key === 'Escape') setDaysDraft(String(workingDays));
          }}
          className="w-[36px] text-right font-bold text-[#1a1a2e] bg-transparent outline-none border-b-[1.5px] border-transparent hover:border-[#e5e7eb] focus:border-[#1a1a2e] disabled:cursor-not-allowed"
        />{' '}
        working days
      </div>

      <div className="text-[11px] text-[#9ca3af] italic">
        Green ring window: {Math.max(0, dailyHours - 0.5).toFixed(1)}h –{' '}
        {(dailyHours + 1).toFixed(1)}h
      </div>
    </div>
  );
}

function SelectedDayPanel({
  date,
  secondsLogged,
  dailyGoalHours,
  todayMidnightMs,
  isToday,
}: {
  date: Date;
  secondsLogged: number;
  dailyGoalHours: number;
  todayMidnightMs: number;
  isToday: boolean;
}) {
  const setView = useStore((s) => s.setView);
  const hours = secondsLogged / 3600;
  const isFuture = date.getTime() > todayMidnightMs;
  const color = isFuture ? 'empty' : ringColorFor(hours, dailyGoalHours);
  const pct = dailyGoalHours > 0 ? (hours / dailyGoalHours) * 100 : 0;

  return (
    <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af]">
          Selected day
        </div>
        <div className="flex items-center gap-1">
          {isToday && (
            <span className="text-[9px] font-bold tracking-[0.5px] px-[5px] py-[1px] rounded bg-[#1a1a2e] text-white">
              TODAY
            </span>
          )}
          {!isToday && !isFuture && (
            <span
              className="text-[9px] font-bold tracking-[0.5px] px-[5px] py-[1px] rounded"
              style={{ background: '#fef3c7', color: '#78350f' }}
            >
              PAST
            </span>
          )}
          {isFuture && (
            <span
              className="text-[9px] font-bold tracking-[0.5px] px-[5px] py-[1px] rounded"
              style={{ background: '#dbeafe', color: '#1e40af' }}
            >
              FUTURE
            </span>
          )}
        </div>
      </div>
      <div className="text-[13px] font-extrabold text-[#1a1a2e] mb-3">
        {date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span
          className="text-[24px] font-extrabold tabular-nums"
          style={{ color: RING_COLOR_HEX[color] === '#d1d5db' ? '#1a1a2e' : RING_COLOR_HEX[color] }}
        >
          {fmtShort(secondsLogged)}
        </span>
        <span className="text-[12px] text-[#9ca3af]">
          of {dailyGoalHours.toFixed(1)}h target
        </span>
      </div>

      <div
        className="rounded-full h-[5px] overflow-hidden mb-3"
        style={{ background: 'rgba(0,0,0,0.06)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: RING_COLOR_HEX[color] === '#d1d5db'
              ? '#1a1a2e'
              : RING_COLOR_HEX[color],
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          setView('timeline');
        }}
        className="text-[11px] text-[#1a1a2e] hover:underline bg-transparent border-0 cursor-pointer p-0"
      >
        Open in Timeline →
      </button>
    </div>
  );
}

// ----- helpers ------------------------------------------------------------

function addMonths(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setMonth(d.getMonth() + delta);
  return next;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Sunday that starts the week containing `d`. ISO uses Monday-first but JS
// Date.getDay() returns 0=Sun..6=Sat — we match the calendar grid (Sun-first)
// so the week boundaries here line up with the grid rows.
function sundayOf(d: Date): Date {
  const s = new Date(d);
  s.setDate(d.getDate() - d.getDay());
  s.setHours(0, 0, 0, 0);
  return s;
}

function weekRangeLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}
