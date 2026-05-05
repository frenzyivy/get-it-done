'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { addDays, sameYMD, startOfWeekMonday } from '@/lib/dateUtils';
import type { PlannedBlock, TagType, TaskType } from '@/types';
import { EditTaskDrawer } from './EditTaskDrawer';

// Feature 11 — Week View. 7 day columns + 17 hour rows (06:00–22:00). Reads
// the focused date from the same store state Day & Month use, so navigating
// from any sub-view to another keeps a coherent "selected day" — clicking a
// week-day header lands the Day view on that exact date.

const HOUR_HEIGHT = 50; // px per hour row, per Feature 11 spec
const START_HOUR = 6;
const END_HOUR = 22; // last visible hour label, inclusive
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => START_HOUR + i,
); // [6..22], 17 entries
const BODY_HEIGHT = HOURS.length * HOUR_HEIGHT; // 850px

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ScheduleWeekView() {
  const userId = useStore((s) => s.userId);
  const tasks = useStore((s) => s.tasks);
  const tags = useStore((s) => s.tags);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const daySessions = useStore((s) => s.daySessions);
  const fetchDaySessions = useStore((s) => s.fetchDaySessions);
  const scheduleDayStartMs = useStore((s) => s.scheduleDayStartMs);
  const setScheduleDayStart = useStore((s) => s.setScheduleDayStart);
  const setScheduleSubView = useStore((s) => s.setScheduleSubView);
  const setPendingScrollHour = useStore((s) => s.setPendingScrollHour);

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const focusedDate = useMemo(
    () => new Date(scheduleDayStartMs),
    [scheduleDayStartMs],
  );
  const weekStart = useMemo(
    () => startOfWeekMonday(focusedDate),
    [focusedDate],
  );
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  // `today` is derived from the live `now` clock so the highlight follows midnight.
  const today = now;

  // Fetch the week's planned blocks once per visible week.
  useEffect(() => {
    if (!userId) return;
    void fetchPlannedBlocks(weekStart.toISOString(), weekEnd.toISOString());
  }, [userId, fetchPlannedBlocks, weekStart, weekEnd]);

  // The store keeps only one day of tracked sessions at a time. Fetch today's
  // by default so the Today column shows tracked overlay; a follow-up ticket
  // can introduce a week-range endpoint to show tracked blocks for all 7 days.
  useEffect(() => {
    if (!userId) return;
    void fetchDaySessions(ymdLocal(new Date()));
  }, [userId, fetchDaySessions]);

  // Tick `now` every minute so the per-day tracked totals stay live.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Bucket planned blocks by YMD key for O(1) per-day lookup.
  const blocksByDay = useMemo(() => {
    const m = new Map<string, PlannedBlock[]>();
    for (const b of plannedBlocks) {
      const key = ymdLocal(new Date(b.start_at));
      const arr = m.get(key) ?? [];
      arr.push(b);
      m.set(key, arr);
    }
    return m;
  }, [plannedBlocks]);

  const drillToDay = (date: Date, hour?: number) => {
    setScheduleDayStart(date);
    setPendingScrollHour(hour ?? null);
    setScheduleSubView('day');
  };

  return (
    <div
      className="rounded-[14px] overflow-hidden flex flex-col"
      style={{ background: '#fff', border: '1px solid #e5e7eb' }}
    >
      <WeekHeader
        days={days}
        today={today}
        blocksByDay={blocksByDay}
        onDrillIn={drillToDay}
      />
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        <div
          className="grid"
          style={{ gridTemplateColumns: '60px repeat(7, 1fr)', height: BODY_HEIGHT }}
        >
          <WeekHourLabels />
          {days.map((day) => (
            <WeekDayColumn
              key={day.toISOString()}
              day={day}
              isToday={sameYMD(day, today)}
              blocks={blocksByDay.get(ymdLocal(day)) ?? []}
              tracked={
                daySessions && daySessions.date === ymdLocal(day)
                  ? daySessions.sessions
                  : []
              }
              tasks={tasks}
              tags={tags}
              onDrillIn={drillToDay}
              onBlockClick={(taskId) => setOpenTaskId(taskId)}
              nowMs={now.getTime()}
            />
          ))}
        </div>
      </div>
      <WeekLegend />
      {openTaskId && (
        <EditTaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      )}
    </div>
  );
}

function WeekHeader({
  days,
  today,
  blocksByDay,
  onDrillIn,
}: {
  days: Date[];
  today: Date;
  blocksByDay: Map<string, PlannedBlock[]>;
  onDrillIn: (date: Date) => void;
}) {
  return (
    <div
      className="grid sticky top-0 z-50 bg-white border-b border-[#e5e7eb]"
      style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}
    >
      <div /> {/* spacer for hour-labels column */}
      {days.map((day) => {
        const isTodayCol = sameYMD(day, today);
        const blocks = blocksByDay.get(ymdLocal(day)) ?? [];
        let inGridSec = 0;
        let offHoursCount = 0;
        for (const b of blocks) {
          const h = new Date(b.start_at).getHours();
          if (h >= START_HOUR && h <= END_HOUR) inGridSec += b.duration_seconds;
          else offHoursCount += 1;
        }
        const plannedHours = inGridSec / 3600;
        const plannedLabel = plannedHours > 0
          ? `${plannedHours.toFixed(1)}h planned`
          : '—';
        return (
          <button
            key={day.toISOString()}
            type="button"
            onClick={() => onDrillIn(day)}
            className="text-left px-3 py-2 cursor-pointer border-0 border-l border-[#f3f4f6] flex flex-col gap-0.5 hover:bg-[#fafafa] transition-colors"
            style={{ background: isTodayCol ? '#fff7ed' : 'transparent' }}
            title={`Open ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
          >
            <span className="text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af]">
              {day.toLocaleDateString(undefined, { weekday: 'short' })}
            </span>
            <span
              className="text-[22px] font-extrabold leading-none tabular-nums"
              style={{ color: isTodayCol ? '#f97316' : '#1a1a2e' }}
            >
              {day.getDate()}
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#9ca3af] tabular-nums">
              {plannedLabel}
              {offHoursCount > 0 && (
                <span
                  className="px-1 py-[1px] rounded text-[9px] font-bold"
                  style={{ background: '#f3f4f6', color: '#71717a' }}
                  title={`${offHoursCount} block${offHoursCount === 1 ? '' : 's'} outside ${START_HOUR}:00–${END_HOUR}:00`}
                >
                  +{offHoursCount} off-hours
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WeekHourLabels() {
  return (
    <div className="border-r border-[#f3f4f6]">
      {HOURS.map((h) => (
        <div
          key={h}
          className="text-[10px] font-mono text-[#9ca3af] tabular-nums text-right pr-2 pt-[2px]"
          style={{ height: HOUR_HEIGHT }}
        >
          {String(h).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  );
}

function WeekDayColumn({
  day,
  isToday,
  blocks,
  tracked,
  tasks,
  tags,
  onDrillIn,
  onBlockClick,
  nowMs,
}: {
  day: Date;
  isToday: boolean;
  blocks: PlannedBlock[];
  tracked: {
    id: string;
    task_id: string | null;
    subtask_id: string | null;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
    mode: string | null;
  }[];
  tasks: TaskType[];
  tags: TagType[];
  onDrillIn: (date: Date, hour?: number) => void;
  onBlockClick: (taskId: string) => void;
  nowMs: number;
}) {
  return (
    <div
      className="relative border-l border-[#f3f4f6]"
      style={{ background: isToday ? 'rgba(249, 115, 22, 0.04)' : 'transparent' }}
    >
      {/* Click-target hour cells (background grid). */}
      {HOURS.map((h) => (
        <button
          key={h}
          type="button"
          onClick={() => onDrillIn(day, h)}
          className="block w-full border-b border-dashed border-[#f3f4f6] cursor-pointer bg-transparent hover:bg-[rgba(0,0,0,0.025)] transition-colors border-x-0 border-t-0 p-0"
          style={{ height: HOUR_HEIGHT }}
          aria-label={`Open ${day.toLocaleDateString()} at ${h}:00`}
        />
      ))}

      {/* Planned blocks — color-coded by task tag. */}
      {blocks.map((b) => {
        const start = new Date(b.start_at);
        const startHour = start.getHours();
        // Hide off-hours blocks (chip in header surfaces their existence).
        if (startHour < START_HOUR || startHour > END_HOUR) return null;
        const minutesFromTop =
          (startHour - START_HOUR) * 60 + start.getMinutes();
        const top = (minutesFromTop / 60) * HOUR_HEIGHT;
        const height = Math.max(
          14,
          (b.duration_seconds / 3600) * HOUR_HEIGHT - 2,
        );
        const task = tasks.find((t) => t.id === b.task_id);
        const tagColor =
          (task?.tag_ids[0] && tags.find((x) => x.id === task.tag_ids[0])?.color) ||
          '#1a1a2e';
        const subtask = b.subtask_id
          ? task?.subtasks.find((s) => s.id === b.subtask_id) ?? null
          : null;
        const label = subtask?.title ?? task?.title ?? 'Untitled block';
        const startStr = `${String(startHour).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
        return (
          <div
            key={b.id}
            onClick={(e) => {
              e.stopPropagation();
              if (b.task_id) onBlockClick(b.task_id);
            }}
            className="absolute rounded-md px-1.5 py-1 cursor-pointer hover:shadow-md hover:z-10 transition-shadow"
            style={{
              left: 2,
              right: 2,
              top,
              height,
              background: '#fff',
              borderLeft: `3px solid ${tagColor}`,
              boxShadow: '0 0 0 1px #e5e7eb',
              zIndex: 1,
            }}
            title={`${startStr} · ${label}`}
          >
            <div className="text-[9px] font-mono text-[#9ca3af] tabular-nums leading-none">
              {startStr}
            </div>
            <div
              className="text-[11px] font-bold text-[#1a1a2e] leading-tight mt-0.5 overflow-hidden"
              style={{
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
              }}
            >
              {label}
            </div>
          </div>
        );
      })}

      {/* Tracked sessions — dark gray/black, distinct from planned. */}
      {tracked.map((s) => {
        const start = new Date(s.started_at);
        const startHour = start.getHours();
        if (startHour < START_HOUR || startHour > END_HOUR) return null;
        const endMs = s.ended_at ? new Date(s.ended_at).getTime() : nowMs;
        const durationSec = Math.max(0, Math.round((endMs - start.getTime()) / 1000));
        if (durationSec <= 0) return null;
        const minutesFromTop =
          (startHour - START_HOUR) * 60 + start.getMinutes();
        const top = (minutesFromTop / 60) * HOUR_HEIGHT;
        const height = Math.max(8, (durationSec / 3600) * HOUR_HEIGHT - 2);
        const task = tasks.find((t) => t.id === s.task_id);
        const subtask = s.subtask_id
          ? task?.subtasks.find((sub) => sub.id === s.subtask_id) ?? null
          : null;
        const label = subtask?.title ?? task?.title ?? 'Untracked';
        const isLive = s.ended_at === null;
        const startStr = `${String(startHour).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
        return (
          <div
            key={s.id}
            onClick={(e) => {
              e.stopPropagation();
              if (s.task_id) onBlockClick(s.task_id);
            }}
            className="absolute rounded-md px-1.5 py-1 cursor-pointer hover:shadow-md hover:z-10 transition-shadow"
            style={{
              left: 2,
              right: 2,
              top,
              height,
              background: isLive ? '#1a1a2e' : 'rgba(26,26,46,0.85)',
              color: '#fff',
              zIndex: 2,
            }}
            title={`Tracked · ${startStr} · ${label}${isLive ? ' (live)' : ''}`}
          >
            <div
              className="text-[9px] font-mono tabular-nums leading-none"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
              {startStr}
            </div>
            <div
              className="text-[11px] font-bold leading-tight mt-0.5 overflow-hidden"
              style={{
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
              }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekLegend() {
  return (
    <div className="px-4 py-2 border-t border-[#f3f4f6] flex items-center gap-4 text-[10px] font-mono text-[#9ca3af]">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-sm"
          style={{ background: '#fff', boxShadow: 'inset 0 0 0 1px #e5e7eb', borderLeft: '2px solid #c4b5fd' }}
        />
        Planned
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-sm"
          style={{ background: '#1a1a2e' }}
        />
        Tracked
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: '#f97316' }}
        />
        Today
      </span>
      <span className="ml-auto italic normal-case tracking-normal text-[#9ca3af]">
        Click any day header to drill in · drag blocks to reschedule (coming soon)
      </span>
    </div>
  );
}
