'use client';

import { useState } from 'react';
import { fmtShort, fmtDueDate, getProgress, isOverdue } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { PriorityBadge } from './PriorityBadge';
import { TagBadge } from './TagBadge';
import { ProgressBar } from './ProgressBar';
import { SubtaskItem } from './SubtaskItem';
import { AddSubtask } from './AddSubtask';
import { PomodoroTimer } from './PomodoroTimer';
import type { TaskType } from '@/types';

interface Props {
  task: TaskType;
  compact?: boolean;
}

export function TaskCard({ task, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const tags = useStore((s) => s.tags);
  const deleteTask = useStore((s) => s.deleteTask);
  const addSubtask = useStore((s) => s.addSubtask);
  const toggleSubtask = useStore((s) => s.toggleSubtask);
  const renameSubtask = useStore((s) => s.renameSubtask);
  const deleteSubtask = useStore((s) => s.deleteSubtask);
  const activeSession = useStore((s) => s.activeSession);
  const startTrackingTask = useStore((s) => s.startTrackingTask);
  const stopActiveSession = useStore((s) => s.stopActiveSession);

  // v2 §7 — one-tap timer start. "Tracking" left border on active card.
  const isTrackingThisTask = activeSession?.task_id === task.id;
  const handleQuickPlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTrackingThisTask) return void stopActiveSession();
    if (activeSession) {
      const ok = confirm(
        `Stop the current timer and start tracking "${task.title}"?`,
      );
      if (!ok) return;
    }
    await startTrackingTask(task.id);
  };

  const progress = getProgress(task.subtasks);
  const overdue = isOverdue(task.due_date, task.status);
  const taskTags = task.tag_ids.map((id) => tags.find((t) => t.id === id));

  const { timerIcon, panel, running, totalTime } = PomodoroTimer({
    task,
    expanded: timerOpen,
    onToggle: () => setTimerOpen((v) => !v),
  });

  const baseShadow = '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)';
  const hoverShadow = '0 4px 16px rgba(139,92,246,0.13), 0 0 0 1px rgba(139,92,246,0.18)';
  const runningShadow =
    '0 4px 20px rgba(139,92,246,0.2), 0 0 0 2px rgba(139,92,246,0.25)';

  const doneCount = task.subtasks.filter((s) => s.is_done).length;

  return (
    <div
      className="bg-white rounded-[14px] transition-shadow duration-300"
      style={{
        padding: compact ? 14 : 18,
        boxShadow: running || isTrackingThisTask ? runningShadow : baseShadow,
        borderLeft: isTrackingThisTask ? '3px solid #8b5cf6' : '3px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!running) e.currentTarget.style.boxShadow = hoverShadow;
      }}
      onMouseLeave={(e) => {
        if (!running) e.currentTarget.style.boxShadow = baseShadow;
      }}
    >
      <div className="flex items-start gap-[10px] mb-2">
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
              className={`font-bold text-[#1a1a2e] leading-[1.3] ${
                compact ? 'text-sm' : 'text-[15px]'
              }`}
            >
              {task.title}
            </span>
            {totalTime > 0 && (
              <span className="text-[11px] font-bold text-[#8b5cf6] bg-[rgba(139,92,246,0.08)] px-[7px] py-[1px] rounded-md whitespace-nowrap">
                🕐 {fmtShort(totalTime)}
              </span>
            )}
            {task.estimated_seconds && task.estimated_seconds > 0 && (
              <span
                className="text-[11px] font-semibold px-[7px] py-[1px] rounded-md whitespace-nowrap"
                style={{
                  background: 'rgba(0,0,0,0.04)',
                  color:
                    totalTime > task.estimated_seconds * 1.1
                      ? '#dc2626'
                      : totalTime > task.estimated_seconds * 0.9
                        ? '#f59e0b'
                        : '#888',
                }}
                title={`Estimated ${fmtShort(task.estimated_seconds)}`}
              >
                Est {fmtShort(task.estimated_seconds)}
              </span>
            )}
          </div>
          <div className="flex gap-[6px] flex-wrap mt-[6px] items-center">
            <PriorityBadge priority={task.priority} />
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
          title={isTrackingThisTask ? 'Stop timer' : 'Start timer'}
          aria-label={isTrackingThisTask ? 'Stop timer' : 'Start timer'}
        >
          {isTrackingThisTask ? '⏸' : '▶'}
        </button>
        <button
          onClick={() => deleteTask(task.id)}
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
              onToggle={() => toggleSubtask(task.id, s.id)}
              onDelete={() => deleteSubtask(task.id, s.id)}
              onRename={(t) => renameSubtask(task.id, s.id, t)}
            />
          ))}
          <AddSubtask onAdd={(title) => addSubtask(task.id, title)} />
        </div>
      )}
    </div>
  );
}
