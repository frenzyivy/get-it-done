'use client';

import { useEffect, useRef, useState } from 'react';
import { fmtShort, fmtDueDate, isOverdue, todayISO, tomorrowISO, whyInProgressLine } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { useLiveTimers } from '@/lib/useLiveTimer';
import { PriorityBadge } from './PriorityBadge';
import { TagBadge } from './TagBadge';
import { CategoryPill } from './CategoryPill';
import { ProjectBadge } from './ProjectBadge';
import { SubtaskItem } from './SubtaskItem';
import { AddSubtask } from './AddSubtask';
import { PomodoroTimer } from './PomodoroTimer';
import { EditTaskDrawer } from './EditTaskDrawer';
import type { TaskType } from '@/types';

interface Props {
  task: TaskType;
}

export function PriorityTaskCard({ task }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const tags = useStore((s) => s.tags);
  const categories = useStore((s) => s.categories);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
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

  const sessionsForThisTask = activeSessions.filter((s) => s.task_id === task.id);
  const taskLevelSession = sessionsForThisTask.find((s) => s.subtask_id === null);
  const isTrackingThisTask = !!taskLevelSession;
  const isTrackingThisCard = sessionsForThisTask.length > 0;
  const liveElapsedForCard = sessionsForThisTask.reduce(
    (sum, s) => sum + (elapsedMap[s.id] ?? 0),
    0,
  );

  const todayStr = todayISO();
  const tomorrowStr = tomorrowISO();
  const isPlannedToday = task.planned_for_date === todayStr;
  const isPlannedTomorrow = task.planned_for_date === tomorrowStr;

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

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
      status: isCurrentlyDone ? 'in_progress' : 'done',
      completed_at: isCurrentlyDone ? null : new Date().toISOString(),
    });
  };

  const handleToggleToday = async () => {
    setMenuOpen(false);
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

  const handleToggleTomorrow = async () => {
    setMenuOpen(false);
    const next = isPlannedTomorrow ? null : tomorrowStr;
    await updateTask(task.id, { planned_for_date: next });
  };

  const handleEdit = () => {
    setMenuOpen(false);
    setEditing(true);
  };

  const handleDelete = () => {
    setMenuOpen(false);
    deleteTask(task.id);
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

  const overdue = isOverdue(task.due_date, task.effective_status);
  const taskTags = task.tag_ids.map((id) => tags.find((t) => t.id === id));
  const taskCategories = task.category_ids
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const taskProjects = task.project_ids
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const { panel, running } = PomodoroTimer({
    task,
    expanded: timerOpen,
    onToggle: () => setTimerOpen((v) => !v),
  });

  const invested = task.total_time_seconds + liveElapsedForCard;

  const baseShadow = '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)';
  const hoverShadow = '0 4px 16px rgba(0,0,0,0.13), 0 0 0 1px rgba(0,0,0,0.18)';
  const runningShadow =
    '0 4px 20px rgba(0,0,0,0.2), 0 0 0 2px rgba(0,0,0,0.25)';

  const doneCount = task.subtasks.filter((s) => s.is_done).length;
  const incompleteSubsOnDone =
    task.effective_status === 'done' && task.subtasks.length > 0 && doneCount < task.subtasks.length;

  let investedColor = '#6b7280';
  let investedBg = 'transparent';
  if (task.estimated_seconds && task.estimated_seconds > 0 && invested > 0) {
    if (invested > task.estimated_seconds * 1.5) {
      investedColor = '#fff';
      investedBg = '#dc2626';
    } else if (invested > task.estimated_seconds) {
      investedColor = '#92400e';
      investedBg = '#fde68a';
    }
  }

  const isDone = task.effective_status === 'done';
  const isHot = running || isTrackingThisCard;

  return (
    <>
      <style>{`
        @keyframes priorityCardPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
      <div
        className="group bg-white rounded-[14px] p-[14px] transition-shadow duration-300 relative"
        style={{
          boxShadow: isHot ? runningShadow : baseShadow,
          borderLeft: isTrackingThisCard ? '3px solid #1a1a2e' : '3px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!isHot) e.currentTarget.style.boxShadow = hoverShadow;
        }}
        onMouseLeave={(e) => {
          if (!isHot) e.currentTarget.style.boxShadow = baseShadow;
        }}
      >
        {/* Row 1 — title row */}
        <div className="flex items-start gap-2">
          <button
            onClick={handleCheckbox}
            className="w-[20px] h-[20px] rounded-[6px] flex items-center justify-center text-white text-[11px] shrink-0 transition-all cursor-pointer mt-[1px]"
            style={{
              border: isDone ? 'none' : '2px solid #ccc',
              background: isDone ? '#10b981' : 'transparent',
            }}
            title={isDone ? 'Mark as in progress' : 'Mark as done'}
            aria-label={isDone ? 'Mark as in progress' : 'Mark as done'}
          >
            {isDone ? '✓' : ''}
          </button>
          <div
            className={`flex-1 min-w-0 text-[14px] font-semibold leading-[1.3] break-words ${
              isDone ? 'line-through text-[#888]' : 'text-[#1a1a2e]'
            }`}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {task.title}
          </div>

          {/* Overflow menu — hover/focus reveal */}
          <div
            ref={menuRef}
            className={`relative shrink-0 transition-opacity ${
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="w-6 h-6 rounded-md border-0 bg-transparent text-[#888] hover:bg-[rgba(0,0,0,0.05)] hover:text-[#1a1a2e] cursor-pointer text-[14px] leading-none flex items-center justify-center"
              title="More actions"
              aria-label="More actions"
              aria-expanded={menuOpen}
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-7 z-20 min-w-[160px] rounded-lg bg-white py-1"
                style={{
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)',
                }}
              >
                <MenuItem
                  onClick={handleToggleToday}
                  icon={isPlannedToday ? '⭐' : '☆'}
                  label={isPlannedToday ? "Remove from today's 5" : "Add to today's 5"}
                />
                <MenuItem
                  onClick={handleToggleTomorrow}
                  icon="📅"
                  label={isPlannedTomorrow ? 'Unplan tomorrow' : 'Plan for tomorrow'}
                />
                <MenuItem onClick={handleEdit} icon="✎" label="Edit task" />
                <MenuItem onClick={handleDelete} icon="🗑" label="Delete task" danger />
              </div>
            )}
          </div>
        </div>

        {/* Row 2 — metadata row */}
        <div className="flex flex-wrap gap-[6px] mt-[8px] items-center">
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
              className="text-[11px] font-medium px-2 py-[2px] rounded-md whitespace-nowrap"
              style={{
                color: overdue ? '#dc2626' : '#6b7280',
                background: overdue ? '#fee2e2' : 'transparent',
                fontWeight: overdue ? 700 : 500,
              }}
            >
              {overdue ? '⚠ ' : ''}Due {fmtDueDate(task.due_date)}
            </span>
          )}
          {incompleteSubsOnDone && (
            <span
              title={`${task.subtasks.length - doneCount} subtask${
                task.subtasks.length - doneCount === 1 ? '' : 's'
              } not done`}
              className="text-[11px] font-medium text-[#92400e] bg-[#fde68a] px-2 py-[2px] rounded-md whitespace-nowrap"
            >
              ⚠ {task.subtasks.length - doneCount} not done
            </span>
          )}
        </div>

        {/* Row 3 — footer */}
        <div className="flex items-center justify-between mt-[10px] gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="font-mono tabular-nums text-[11px] font-semibold flex items-center gap-[5px] whitespace-nowrap"
              style={{
                color: invested > 0 ? investedColor : '#9ca3af',
                background: investedBg,
                padding: investedBg !== 'transparent' ? '1px 6px' : 0,
                borderRadius: 4,
              }}
              title={
                invested > 0
                  ? `Total tracked: ${fmtShort(invested)}`
                  : 'No time logged yet'
              }
            >
              {isTrackingThisCard && (
                <span
                  className="w-[6px] h-[6px] rounded-full bg-[#1a1a2e]"
                  style={{
                    animation: 'priorityCardPulse 1.4s ease-in-out infinite',
                  }}
                  aria-hidden
                />
              )}
              {invested > 0 ? fmtShort(invested) : '0s'}
            </span>
            {task.estimated_seconds && task.estimated_seconds > 0 ? (
              <span className="text-[11px] font-medium text-[#9ca3af] whitespace-nowrap">
                · est {fmtShort(task.estimated_seconds)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleQuickPlay}
              className="w-7 h-7 rounded-full border-0 cursor-pointer flex items-center justify-center text-[12px] font-bold transition-colors"
              style={{
                background: isTrackingThisTask ? '#1a1a2e' : 'rgba(0,0,0,0.06)',
                color: isTrackingThisTask ? '#fff' : '#1a1a2e',
              }}
              title={isTrackingThisTask ? 'Stop timer' : 'Track whole task'}
              aria-label={isTrackingThisTask ? 'Stop timer' : 'Track whole task'}
            >
              {isTrackingThisTask ? '⏸' : '▶'}
            </button>
            <button
              onClick={() => setTimerOpen((v) => !v)}
              className="w-7 h-7 rounded-full border-0 cursor-pointer flex items-center justify-center text-[11px] text-[#6b7280] hover:bg-[rgba(0,0,0,0.05)] hover:text-[#1a1a2e]"
              title={timerOpen ? 'Hide timer panel' : 'Open timer panel'}
              aria-label={timerOpen ? 'Hide timer panel' : 'Open timer panel'}
              style={{ background: 'transparent' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-7 h-7 rounded-full border-0 bg-transparent cursor-pointer text-[11px] text-[#6b7280] hover:bg-[rgba(0,0,0,0.05)] hover:text-[#1a1a2e] transition-transform duration-200 flex items-center justify-center"
              style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
              aria-label={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
              title={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
            >
              ▶
            </button>
          </div>
        </div>

        {panel}

        {task.effective_status === 'in_progress' && (
          <div className="text-[11px] italic text-[#6b7280] mt-[6px]">
            {whyInProgressLine(task)}
          </div>
        )}

        {expanded && task.subtasks.length > 0 && (
          <div
            className="mt-[8px] flex items-center gap-[8px] px-[10px] py-[6px] rounded-md"
            style={{ background: 'rgba(0,0,0,0.03)' }}
          >
            <span className="text-[10px] font-mono uppercase tracking-[1px] font-semibold text-[#9ca3af] shrink-0">
              Time
            </span>
            <span
              className="flex-1 h-px"
              style={{ background: 'rgba(0,0,0,0.08)' }}
              aria-hidden
            />
            <span className="text-[11px] font-medium text-[#6b7280] shrink-0">
              {task.subtasks.filter((s) => s.total_time_seconds > 0).length} of{' '}
              {task.subtasks.length} subtask
              {task.subtasks.length === 1 ? '' : 's'} worked
            </span>
            <span className="text-[11px] font-mono tabular-nums font-semibold text-[#1a1a2e] shrink-0">
              {fmtShort(task.subtasks.reduce((sum, s) => sum + s.total_time_seconds, 0))}
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

function MenuItem({
  onClick,
  icon,
  label,
  danger = false,
}: {
  onClick: () => void;
  icon: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-[7px] text-[12px] font-medium text-left bg-transparent border-0 cursor-pointer hover:bg-[rgba(0,0,0,0.04)] transition-colors"
      style={{ color: danger ? '#dc2626' : '#1a1a2e' }}
    >
      <span className="w-4 text-center text-[12px] leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
