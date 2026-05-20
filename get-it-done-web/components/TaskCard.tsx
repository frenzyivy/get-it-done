'use client';

import { useEffect, useState } from 'react';
import { fmtShort, fmtDueDate, getProgress, isOverdue, todayISO, tomorrowISO, whyInProgressLine } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { useLiveTimers } from '@/lib/useLiveTimer';
import { PriorityBadge } from './PriorityBadge';
import { TagBadge } from './TagBadge';
import { CategoryPill } from './CategoryPill';
import { ProjectBadge } from './ProjectBadge';
import { ProgressBar } from './ProgressBar';
import { SubtaskItem } from './SubtaskItem';
import { AddSubtask } from './AddSubtask';
import { PomodoroTimer } from './PomodoroTimer';
import { EditTaskDrawer } from './EditTaskDrawer';
import type { TaskType } from '@/types';

interface Props {
  task: TaskType;
  compact?: boolean;
}

export function TaskCard({ task, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const tags = useStore((s) => s.tags);
  const categories = useStore((s) => s.categories);
  const projects = useStore((s) => s.projects);
  const deleteTask = useStore((s) => s.deleteTask);
  const updateTask = useStore((s) => s.updateTask);
  const addSubtask = useStore((s) => s.addSubtask);
  const toggleSubtask = useStore((s) => s.toggleSubtask);
  const renameSubtask = useStore((s) => s.renameSubtask);
  const deleteSubtask = useStore((s) => s.deleteSubtask);
  const activeSessions = useStore((s) => s.activeSessions);
  const startTrackingTask = useStore((s) => s.startTrackingTask);
  const stopSession = useStore((s) => s.stopSession);
  const openFocusMode = useStore((s) => s.openFocusMode);
  const prefs = useStore((s) => s.prefs);

  const elapsedMap = useLiveTimers();

  // Sessions tied to this task (task-level OR any subtask-level). Each session
  // contributes to the invested chip; any of them means "this card is running".
  const sessionsForThisTask = activeSessions.filter((s) => s.task_id === task.id);
  const taskLevelSession = sessionsForThisTask.find((s) => s.subtask_id === null);
  const isTrackingThisTask = !!taskLevelSession;
  const isTrackingThisCard = sessionsForThisTask.length > 0;
  const liveElapsedForCard = sessionsForThisTask.reduce(
    (sum, s) => sum + (elapsedMap[s.id] ?? 0),
    0,
  );

  // Feature 5 — clicking the play icon starts tracking AND opens focus mode if
  // the user's default mode is anything stricter than "open".
  const handleQuickPlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTrackingThisTask && taskLevelSession) {
      return void stopSession(taskLevelSession.id);
    }
    const defaultMode = prefs?.default_timer_mode ?? 'open';
    const session = await startTrackingTask(task.id, null, defaultMode);
    if (session && defaultMode !== 'open') openFocusMode(session.id);
  };

  const handleCheckbox = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const isCurrentlyDone = task.effective_status === 'done';
    await updateTask(task.id, {
      status: isCurrentlyDone ? 'in_progress' : 'done',  // legacy column, kept for mobile
      completed_at: isCurrentlyDone ? null : new Date().toISOString(),
    });
  };

  // "Today's 5" quick actions. If toggling a task ONTO today while 5 are
  // already planned, warn the user but still allow it (it enters the waiting
  // list at the bottom and the drawer lets them reorder).
  const tasks = useStore((s) => s.tasks);
  const todayStr = todayISO();
  const tomorrowStr = tomorrowISO();
  const isPlannedToday = task.planned_for_date === todayStr;
  const isPlannedTomorrow = task.planned_for_date === tomorrowStr;

  const handleToggleToday = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlannedToday) {
      await updateTask(task.id, { planned_for_date: null });
      return;
    }
    const plannedToday = tasks.filter((t) => t.planned_for_date === todayStr);
    if (plannedToday.length >= 5) {
      const ok = confirm(
        `Today already has 5 tasks in "Today's 5". Add "${task.title}" as #${plannedToday.length + 1}? ` +
          `You'll need to reorder in the Today's 5 drawer to bring it into the top 5.`,
      );
      if (!ok) return;
      const maxOrder = Math.max(...plannedToday.map((t) => t.sort_order));
      await updateTask(task.id, {
        planned_for_date: todayStr,
        sort_order: maxOrder + 1,
      });
      return;
    }
    await updateTask(task.id, { planned_for_date: todayStr });
  };

  const handleToggleTomorrow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = isPlannedTomorrow ? null : tomorrowStr;
    await updateTask(task.id, { planned_for_date: next });
  };

  const handleDeleteSub = async (subId: string) => {
    const sub = task.subtasks.find((s) => s.id === subId);
    if (sub && sub.total_time_seconds + sub.tracked_total_seconds > 0) {
      const ok = confirm(
        `This subtask has tracked time. Delete anyway? Time entries will be kept but unlinked from the subtask.`,
      );
      if (!ok) return;
    }
    await deleteSubtask(task.id, subId);
  };

  const progress = getProgress(task.subtasks);
  const overdue = isOverdue(task.due_date, task.effective_status);
  const taskTags = task.tag_ids.map((id) => tags.find((t) => t.id === id));
  const taskCategories = task.category_ids
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const taskProjects = task.project_ids
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const { timerIcon, panel, running } = PomodoroTimer({
    task,
    expanded: timerOpen,
    onToggle: () => setTimerOpen((v) => !v),
  });

  // Feature 2b — invested chip. Three components:
  //   1. Legacy `total_time_seconds` (only bumped by the old Pomodoro
  //      save_time_session RPC).
  //   2. `tracked_total_seconds` — sum of closed tracked_sessions, the path
  //      the current live timer uses.
  //   3. `liveElapsedForCard` — seconds ticking in any open session on the
  //      task / its subtasks right now.
  // Without (2) the chip showed "0s NEVER STARTED" on tasks that had logged
  // hours via the live timer, since the legacy column was never updated.
  const invested =
    task.total_time_seconds + task.tracked_total_seconds + liveElapsedForCard;

  const baseShadow = '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)';
  const hoverShadow = '0 4px 16px rgba(0,0,0,0.13), 0 0 0 1px rgba(0,0,0,0.18)';
  const runningShadow =
    '0 4px 20px rgba(0,0,0,0.2), 0 0 0 2px rgba(0,0,0,0.25)';

  const doneCount = task.subtasks.filter((s) => s.is_done).length;
  const incompleteSubsOnDone =
    task.effective_status === 'done' && task.subtasks.length > 0 && doneCount < task.subtasks.length;

  // Phase 1.2 — "Task not recording time" warning. Ticks once a minute so the
  // amber state appears as soon as the threshold is crossed without a refetch.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const warningThresholdMin = prefs?.warning_threshold_min ?? 20;
  const minutesSinceProgress = task.last_progress_at
    ? Math.floor((nowMs - new Date(task.last_progress_at).getTime()) / 60_000)
    : null;
  const isWarning =
    task.effective_status === 'in_progress' &&
    !isTrackingThisCard &&
    minutesSinceProgress !== null &&
    minutesSinceProgress >= warningThresholdMin;

  // Feature 2b — over-estimate visual states for the invested chip.
  let investedColor = '#888';
  let investedBg = 'rgba(0,0,0,0.04)';
  if (task.estimated_seconds && task.estimated_seconds > 0) {
    if (invested > task.estimated_seconds * 1.5) {
      investedColor = '#fff';
      investedBg = '#dc2626';
    } else if (invested > task.estimated_seconds) {
      investedColor = '#92400e';
      investedBg = '#fde68a';
    }
  }

  return (
    <>
      <style>{`
        @keyframes taskCardLivePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
      <div
        className="bg-white rounded-[14px] transition-shadow duration-300"
        style={{
          padding: compact ? 14 : 18,
          boxShadow: running || isTrackingThisCard ? runningShadow : baseShadow,
          // Phase 1.2 — amber left border on warning. Tracking border wins.
          borderLeft: isTrackingThisCard
            ? '3px solid #1a1a2e'
            : isWarning
              ? '3px solid #f59e0b'
              : '3px solid transparent',
          // Subtle amber tint on warning so it reads at a glance even with the
          // border alone.
          background: isWarning
            ? 'linear-gradient(180deg, #fffbeb 0%, #fff 60%)'
            : '#fff',
        }}
        onMouseEnter={(e) => {
          if (!running && !isTrackingThisCard)
            e.currentTarget.style.boxShadow = hoverShadow;
        }}
        onMouseLeave={(e) => {
          if (!running && !isTrackingThisCard)
            e.currentTarget.style.boxShadow = baseShadow;
        }}
      >
        <div className="flex items-start gap-[10px] mb-2">
          {/* Feature 2c — always-visible task checkbox */}
          <button
            onClick={handleCheckbox}
            className="w-[20px] h-[20px] rounded-[6px] flex items-center justify-center text-white text-xs shrink-0 transition-all cursor-pointer mt-[1px]"
            style={{
              border: task.effective_status === 'done' ? 'none' : '2px solid #ccc',
              background: task.effective_status === 'done' ? '#10b981' : 'transparent',
            }}
            title={task.effective_status === 'done' ? 'Mark as in progress' : 'Mark as done'}
            aria-label={task.effective_status === 'done' ? 'Mark as in progress' : 'Mark as done'}
          >
            {task.effective_status === 'done' ? '✓' : ''}
          </button>
          {timerIcon}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="bg-transparent border-0 cursor-pointer text-sm text-[#aaa] p-0 mt-[2px] transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            aria-label={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
          >
            ▶
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-bold leading-[1.3] ${
                  compact ? 'text-sm' : 'text-[15px]'
                } ${task.effective_status === 'done' ? 'line-through text-[#888]' : 'text-[#1a1a2e]'}`}
              >
                {task.title}
              </span>
              {incompleteSubsOnDone && (
                <span
                  title={`${task.subtasks.length - doneCount} subtask${
                    task.subtasks.length - doneCount === 1 ? '' : 's'
                  } not done`}
                  className="text-[11px] font-bold text-[#92400e] bg-[#fde68a] px-[6px] py-[1px] rounded-md whitespace-nowrap"
                >
                  ⚠ {task.subtasks.length - doneCount} not done
                </span>
              )}
              {/* Spec § Task time displays — two-line block with thin hairline
                  divider before it. Replaces the old "⏱ Xs" pill. Live state
                  (currently tracking) shows a pulsing white-on-purple dot
                  prefix to match the NowTrackingBar pattern. The "TOTAL
                  TRACKED" / "NEVER STARTED" label flips on 0s. Estimate kept
                  separately at lower visual weight when present. */}
              <span
                className="self-stretch w-px"
                style={{ background: 'rgba(0,0,0,0.08)' }}
                aria-hidden
              />
              <span
                className="inline-flex flex-col items-end leading-[1.1]"
                title={
                  invested > 0
                    ? `Total tracked: ${fmtShort(invested)}`
                    : 'No time logged yet'
                }
              >
                <span
                  className="font-mono tabular-nums font-extrabold flex items-center gap-[5px]"
                  style={{
                    color: invested > 0 ? investedColor : '#9ca3af',
                    background: invested > 0 ? investedBg : 'transparent',
                    padding: invested > 0 && investedBg !== 'rgba(0,0,0,0.04)' ? '0 6px' : 0,
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                >
                  {isTrackingThisCard && (
                    <span
                      className="w-[6px] h-[6px] rounded-full bg-[#1a1a2e]"
                      style={{
                        animation: 'taskCardLivePulse 1.4s ease-in-out infinite',
                      }}
                      aria-hidden
                    />
                  )}
                  {invested > 0 ? fmtShort(invested) : '0s'}
                </span>
                <span className="text-[8px] font-mono uppercase tracking-[1px] text-[#9ca3af] mt-[1px]">
                  {invested > 0 ? 'Total tracked' : 'Never started'}
                </span>
              </span>
              {task.estimated_seconds && task.estimated_seconds > 0 && (
                <span
                  className="text-[10px] font-mono tracking-wider whitespace-nowrap text-[#888] uppercase"
                  title={`Estimated ${fmtShort(task.estimated_seconds)}`}
                >
                  est {fmtShort(task.estimated_seconds)}
                </span>
              )}
            </div>
            <div className="flex gap-[6px] flex-wrap mt-[6px] items-center">
              <PriorityBadge priority={task.priority} />
              {taskCategories.map((c) => (
                <CategoryPill key={c.id} category={c} />
              ))}
              {taskProjects.map((p) => (
                <ProjectBadge key={p.id} project={p} />
              ))}
              {taskTags.map((t, i) => (
                <TagBadge key={t?.id ?? i} tag={t} />
              ))}
              {task.due_date && (
                <span
                  className="text-[11px]"
                  style={{
                    color: overdue ? '#dc2626' : '#888',
                    fontWeight: overdue ? 700 : 500,
                  }}
                >
                  {overdue ? '⚠ ' : ''}Due {fmtDueDate(task.due_date)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleQuickPlay}
            className="w-6 h-6 rounded-full border-0 cursor-pointer flex items-center justify-center text-xs font-bold shrink-0"
            style={{
              background: isTrackingThisTask ? '#1a1a2e' : 'rgba(0,0,0,0.1)',
              color: isTrackingThisTask ? '#fff' : '#1a1a2e',
            }}
            title={isTrackingThisTask ? 'Stop timer' : 'Track whole task'}
            aria-label={isTrackingThisTask ? 'Stop timer' : 'Track whole task'}
          >
            {isTrackingThisTask ? '⏸' : '▶'}
          </button>
          {/* "Today's 5" quick-pick */}
          <button
            onClick={handleToggleToday}
            className="bg-transparent border-0 cursor-pointer text-sm p-0 leading-none shrink-0"
            style={{ color: isPlannedToday ? '#f59e0b' : '#ccc' }}
            title={
              isPlannedToday
                ? "On today's 5 · click to remove"
                : "Add to today's 5"
            }
            aria-label={
              isPlannedToday ? "Remove from today's 5" : "Add to today's 5"
            }
          >
            {isPlannedToday ? '⭐' : '☆'}
          </button>
          {/* "Do tomorrow" quick-pick */}
          <button
            onClick={handleToggleTomorrow}
            className="bg-transparent border-0 cursor-pointer text-sm p-0 leading-none shrink-0"
            style={{ color: isPlannedTomorrow ? '#3b82f6' : '#ccc' }}
            title={
              isPlannedTomorrow
                ? 'Planned for tomorrow · click to remove'
                : 'Plan for tomorrow'
            }
            aria-label={
              isPlannedTomorrow
                ? 'Unplan tomorrow'
                : 'Plan for tomorrow'
            }
          >
            📅
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="bg-transparent border-0 text-[#ccc] cursor-pointer text-sm p-0 leading-none hover:text-[#1a1a2e]"
            title="Edit task"
            aria-label="Edit task"
          >
            ✎
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteTask(task.id);
            }}
            className="bg-transparent border-0 text-[#ccc] cursor-pointer text-lg p-0 leading-none hover:text-[#dc2626]"
            title="Delete task"
          >
            ×
          </button>
        </div>

        {panel}

        <div className="mt-2" style={{ marginBottom: expanded ? 8 : 0 }}>
          {/* Spec §6 / Change #5 — Priority view uses compact cards with no
              progress bar visible by default. Subtask count + the "↳ In
              Progress …" line still render so the card stays informative. */}
          {!compact && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <ProgressBar value={progress} />
                <span
                  className="text-xs font-bold min-w-[36px] text-right"
                  style={{ color: progress === 100 ? '#10b981' : '#1a1a2e' }}
                >
                  {progress}%
                </span>
              </div>
              <span className="text-[11px] text-[#aaa]">
                {doneCount}/{task.subtasks.length} subtasks
              </span>
            </>
          )}
          {/* Phase 1.2 — warning caption + inline Start tracking CTA. Renders
              ABOVE whyInProgressLine because it's the more urgent signal:
              a stale in-progress task is what we want the user to act on. */}
          {isWarning && (
            <div className="mt-[6px] flex items-center justify-between gap-2 text-[11px] text-[#92400e] font-semibold">
              <span className="flex items-center gap-[5px]">
                <span aria-hidden>⚠</span>
                In Progress · no time logged in {minutesSinceProgress}m
              </span>
              <button
                onClick={handleQuickPlay}
                className="text-[11px] font-bold text-[#92400e] hover:text-[#78350f] cursor-pointer bg-transparent border-0 underline"
                title="Start tracking this task"
              >
                Start tracking →
              </button>
            </div>
          )}
          {/* Spec Change #1 — surface why a task is showing as In Progress.
              Status is derived from logged time; this line tells the user
              what's behind the derivation. Hidden when the warning is on so
              the warning isn't drowned out. */}
          {task.effective_status === 'in_progress' && !isWarning && (
            <div className="text-[12px] italic text-[#6b7280] mt-[6px]">
              {whyInProgressLine(task)}
            </div>
          )}
        </div>

        {/* Spec § Task time displays — rollup bar between progress bar and
            subtask list. Only shown when the card is expanded AND there are
            subtasks. Format: [TIME BREAKDOWN] ━ X of Y subtasks worked  47m 23s */}
        {expanded && task.subtasks.length > 0 && (
          <div
            className="mt-[8px] flex items-center gap-[8px] px-[10px] py-[6px] rounded-md"
            style={{ background: 'rgba(0,0,0,0.03)' }}
          >
            <span className="text-[9px] font-mono uppercase tracking-[1.5px] font-bold text-[#9ca3af] shrink-0">
              Time breakdown
            </span>
            <span
              className="flex-1 h-px"
              style={{ background: 'rgba(0,0,0,0.08)' }}
              aria-hidden
            />
            <span className="text-[10px] font-mono tracking-wider text-[#666] shrink-0">
              {
                task.subtasks.filter(
                  (s) => s.total_time_seconds + s.tracked_total_seconds > 0,
                ).length
              }{' '}
              of {task.subtasks.length} subtask
              {task.subtasks.length === 1 ? '' : 's'} worked
            </span>
            <span className="text-[11px] font-mono tabular-nums font-bold text-[#1a1a2e] shrink-0">
              {fmtShort(
                task.subtasks.reduce(
                  (sum, s) => sum + s.total_time_seconds + s.tracked_total_seconds,
                  0,
                ),
              )}
            </span>
          </div>
        )}
        {expanded && (
          <div className="mt-[6px]">
            {task.subtasks.map((s) => (
              <SubtaskItem
                key={s.id}
                subtask={s}
                taskId={task.id}
                taskTitle={task.title}
                onToggle={() => toggleSubtask(task.id, s.id)}
                onDelete={() => handleDeleteSub(s.id)}
                onRename={(t) => renameSubtask(task.id, s.id, t)}
              />
            ))}
            <AddSubtask onAdd={(title) => addSubtask(task.id, title)} />
          </div>
        )}
      </div>

      {editing && (
        <EditTaskDrawer key={task.id} taskId={task.id} onClose={() => setEditing(false)} />
      )}
    </>
  );
}
