'use client';

import { useState } from 'react';
import { fmtShort, fmtDueDate, getProgress, isOverdue, todayISO, tomorrowISO } from '@/lib/utils';
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
import type { Status, TaskType } from '@/types';

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
    const next: Status = task.status === 'done' ? 'in_progress' : 'done';
    await updateTask(task.id, { status: next });
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
    if (sub && sub.total_time_seconds > 0) {
      const ok = confirm(
        `This subtask has tracked time. Delete anyway? Time entries will be kept but unlinked from the subtask.`,
      );
      if (!ok) return;
    }
    await deleteSubtask(task.id, subId);
  };

  const progress = getProgress(task.subtasks);
  const overdue = isOverdue(task.due_date, task.status);
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

  // Feature 2b — invested chip. Combines saved task.total_time_seconds with the
  // live elapsed of every tracked_session currently running on this task
  // (covers both task-level and subtask-level live timers and concurrent ones).
  const invested = task.total_time_seconds + liveElapsedForCard;

  const baseShadow = '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)';
  const hoverShadow = '0 4px 16px rgba(139,92,246,0.13), 0 0 0 1px rgba(139,92,246,0.18)';
  const runningShadow =
    '0 4px 20px rgba(139,92,246,0.2), 0 0 0 2px rgba(139,92,246,0.25)';

  const doneCount = task.subtasks.filter((s) => s.is_done).length;
  const incompleteSubsOnDone =
    task.status === 'done' && task.subtasks.length > 0 && doneCount < task.subtasks.length;

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
      <div
        className="bg-white rounded-[14px] transition-shadow duration-300"
        style={{
          padding: compact ? 14 : 18,
          boxShadow: running || isTrackingThisCard ? runningShadow : baseShadow,
          borderLeft: isTrackingThisCard ? '3px solid #8b5cf6' : '3px solid transparent',
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
              border: task.status === 'done' ? 'none' : '2px solid #ccc',
              background: task.status === 'done' ? '#10b981' : 'transparent',
            }}
            title={task.status === 'done' ? 'Mark as in progress' : 'Mark as done'}
            aria-label={task.status === 'done' ? 'Mark as in progress' : 'Mark as done'}
          >
            {task.status === 'done' ? '✓' : ''}
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
                } ${task.status === 'done' ? 'line-through text-[#888]' : 'text-[#1a1a2e]'}`}
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
              {/* Feature 2b — Invested chip (always shown so totals are visible) */}
              <span
                className="text-[11px] font-bold px-[7px] py-[1px] rounded-md whitespace-nowrap"
                style={{ background: investedBg, color: investedColor }}
                title={`Invested ${fmtShort(invested)}`}
              >
                ⏱ {fmtShort(invested)}
              </span>
              {task.estimated_seconds && task.estimated_seconds > 0 && (
                <span
                  className="text-[11px] font-semibold px-[7px] py-[1px] rounded-md whitespace-nowrap"
                  style={{ background: 'rgba(0,0,0,0.04)', color: '#888' }}
                  title={`Estimated ${fmtShort(task.estimated_seconds)}`}
                >
                  Est {fmtShort(task.estimated_seconds)}
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
              background: isTrackingThisTask ? '#8b5cf6' : 'rgba(139,92,246,0.1)',
              color: isTrackingThisTask ? '#fff' : '#8b5cf6',
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
            className="bg-transparent border-0 text-[#ccc] cursor-pointer text-sm p-0 leading-none hover:text-[#8b5cf6]"
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
          <div className="flex items-center gap-2 mb-1">
            <ProgressBar value={progress} />
            <span
              className="text-xs font-bold min-w-[36px] text-right"
              style={{ color: progress === 100 ? '#10b981' : '#8b5cf6' }}
            >
              {progress}%
            </span>
          </div>
          <span className="text-[11px] text-[#aaa]">
            {doneCount}/{task.subtasks.length} subtasks
          </span>
        </div>

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
