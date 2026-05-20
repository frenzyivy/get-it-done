'use client';

import { useState } from 'react';
import { fmtShort, fmtDueDate, isOverdue } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { useLiveTimers } from '@/lib/useLiveTimer';
import { PRIORITIES } from '@/lib/constants';
import { AddTaskForm } from './AddTaskForm';
import { StaleProjectBanner } from './StaleProjectBanner';
import { EditTaskDrawer } from './EditTaskDrawer';
import type { TaskType } from '@/types';

type ColumnMode = 'active' | 'idle' | 'category' | 'unassigned';

interface Props {
  label: string;
  color: string;
  tasks: TaskType[];
  mode: ColumnMode;
  addProjectId: string | null;
  isStale?: boolean;
  lastActivityAt?: string | null;
}

export function ProjectCard({
  label,
  color,
  tasks,
  mode,
  addProjectId,
  isStale,
  lastActivityAt,
}: Props) {
  const isActive = mode === 'active';
  const tasksShort = tasks.length < 4;
  const openTasks = tasks.filter((t) => t.effective_status !== 'done');

  const tracked = tasks.reduce(
    (sum, t) => sum + t.total_time_seconds + t.tracked_total_seconds,
    0,
  );
  const open = tasks.filter((t) => t.effective_status !== 'done').length;
  const done = tasks.filter((t) => t.effective_status === 'done').length;
  const progress = computeProgress(tasks);

  const cardBg = isActive ? '#1a1a2e' : 'rgba(255,255,255,0.7)';
  const ink = isActive ? '#fff' : '#1a1a2e';
  const sub = isActive ? 'rgba(255,255,255,0.55)' : '#888';
  const divider = isActive ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)';

  return (
    <div
      className="rounded-2xl p-[14px] flex flex-col gap-[10px]"
      style={{
        background: cardBg,
        border: isActive
          ? '1px solid rgba(255,255,255,0.08)'
          : '1px solid rgba(0,0,0,0.06)',
        boxShadow: isActive
          ? '0 8px 30px rgba(0,0,0,0.18)'
          : '0 1px 4px rgba(0,0,0,0.04)',
        backdropFilter: isActive ? undefined : 'blur(8px)',
        minHeight: tasksShort ? 200 : 280,
      }}
    >
      <Pill mode={mode} color={color} sub={sub} />

      <div className="font-extrabold text-[16px]" style={{ color: ink }}>
        {label}
      </div>

      <div>
        <div
          className="rounded-full h-[4px] overflow-hidden"
          style={{ background: divider }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: isActive ? '#fff' : '#1a1a2e',
            }}
          />
        </div>
        <div className="text-[11px] mt-[4px]" style={{ color: sub }}>
          {progress}% complete · {tasks.length} task{tasks.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="grid grid-cols-3 text-center">
        <Stat label="Tracked" value={fmtShort(tracked)} ink={ink} sub={sub} />
        <Stat
          label="Open"
          value={String(open)}
          ink={ink}
          sub={sub}
          divider={divider}
        />
        <Stat
          label="Done"
          value={String(done)}
          ink={ink}
          sub={sub}
          divider={divider}
        />
      </div>

      {isStale && addProjectId && !isActive && (
        <StaleProjectBanner
          projectId={addProjectId}
          projectName={label}
          openTasks={openTasks}
          lastActivityAt={lastActivityAt ?? null}
        />
      )}

      {tasks.length > 0 && (
        <div
          className="flex flex-col rounded-lg overflow-hidden max-h-[360px] overflow-y-auto"
          style={{
            background: isActive ? 'rgba(255,255,255,0.04)' : '#fff',
            border: `1px solid ${divider}`,
          }}
        >
          {tasks.map((t, i) => (
            <ProjectTaskRow
              key={t.id}
              task={t}
              isActive={isActive}
              isFirst={i === 0}
            />
          ))}
        </div>
      )}

      <div className="mt-auto pt-1">
        {addProjectId ? (
          <AddTaskForm
            defaultProjectIds={[addProjectId]}
            triggerLabel={`+ Add task to ${label}`}
          />
        ) : (
          <AddTaskForm triggerLabel={`+ New task`} />
        )}
      </div>
    </div>
  );
}

// Compact one-line row used inside ProjectCard. Designed for the narrow
// columns of the List view so titles don't wrap into a tower of one-word
// lines. Click anywhere on the row to open the edit drawer; play/stop on the
// right starts or stops a tracked session for the whole task.
function ProjectTaskRow({
  task,
  isActive,
  isFirst,
}: {
  task: TaskType;
  isActive: boolean;
  isFirst: boolean;
}) {
  const [editing, setEditing] = useState(false);
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
  const liveElapsed = sessionsForThisTask.reduce(
    (sum, s) => sum + (elapsedMap[s.id] ?? 0),
    0,
  );
  const invested =
    task.total_time_seconds + task.tracked_total_seconds + liveElapsed;

  const isDone = task.effective_status === 'done';
  const overdue = isOverdue(task.due_date, task.effective_status);
  const priority = PRIORITIES.find((p) => p.value === task.priority) ?? PRIORITIES[0];

  const doneSubs = task.subtasks.filter((s) => s.is_done).length;
  const totalSubs = task.subtasks.length;

  const ink = isActive ? '#fff' : '#1a1a2e';
  const dim = isActive ? 'rgba(255,255,255,0.55)' : '#6b7280';

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTrackingThisTask && taskLevelSession) {
      return void stopSession(taskLevelSession.id);
    }
    const defaultMode = prefs?.default_timer_mode ?? 'open';
    const session = await startTrackingTask(task.id, null, defaultMode);
    if (session && defaultMode !== 'open') openFocusMode(session.id);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(true);
          }
        }}
        className="flex items-center gap-2 px-[10px] py-[8px] cursor-pointer transition-colors"
        style={{
          borderTop: isFirst
            ? 'none'
            : `1px solid ${isActive ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
          background: isTrackingThisCard
            ? isActive
              ? 'rgba(245,158,11,0.15)'
              : '#fff7ed'
            : 'transparent',
          opacity: isDone ? 0.55 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isTrackingThisCard) {
            e.currentTarget.style.background = isActive
              ? 'rgba(255,255,255,0.04)'
              : 'rgba(0,0,0,0.025)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isTrackingThisCard) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <span
          aria-hidden
          className="self-stretch w-[3px] rounded-full shrink-0"
          style={{ background: priority.bg }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[6px]">
            {isTrackingThisCard && (
              <span
                aria-hidden
                className="w-[6px] h-[6px] rounded-full shrink-0"
                style={{
                  background: isActive ? '#f59e0b' : '#1a1a2e',
                  animation: 'projectRowPulse 1.4s ease-in-out infinite',
                }}
              />
            )}
            <span
              className="font-semibold text-[13px] truncate"
              style={{
                color: ink,
                textDecoration: isDone ? 'line-through' : 'none',
              }}
              title={task.title}
            >
              {task.title}
            </span>
          </div>
          <div
            className="flex items-center gap-[8px] text-[10px] mt-[2px]"
            style={{ color: dim }}
          >
            <span className="font-mono uppercase tracking-wider font-bold">
              {priority.label}
            </span>
            {totalSubs > 0 && (
              <span>
                {doneSubs}/{totalSubs} sub
              </span>
            )}
            {task.due_date && (
              <span
                style={{
                  color: overdue ? '#dc2626' : dim,
                  fontWeight: overdue ? 700 : 400,
                }}
              >
                {overdue ? '⚠ ' : ''}Due {fmtDueDate(task.due_date)}
              </span>
            )}
          </div>
        </div>

        <span
          className="text-[11px] font-mono tabular-nums shrink-0 text-right"
          style={{
            color: invested > 0 ? ink : dim,
            minWidth: 36,
          }}
          title={invested > 0 ? `Total tracked: ${fmtShort(invested)}` : 'No time logged yet'}
        >
          {invested > 0 ? fmtShort(invested) : '0s'}
        </span>

        <button
          onClick={handlePlay}
          className="w-[24px] h-[24px] rounded-full border-0 cursor-pointer flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{
            background: isTrackingThisTask
              ? isActive
                ? '#fff'
                : '#1a1a2e'
              : isActive
                ? 'rgba(255,255,255,0.12)'
                : 'rgba(0,0,0,0.08)',
            color: isTrackingThisTask
              ? isActive
                ? '#1a1a2e'
                : '#fff'
              : ink,
          }}
          title={isTrackingThisTask ? 'Stop timer' : 'Start tracking'}
          aria-label={isTrackingThisTask ? 'Stop timer' : 'Start tracking'}
        >
          {isTrackingThisTask ? '⏸' : '▶'}
        </button>
      </div>

      {editing && (
        <EditTaskDrawer
          key={task.id}
          taskId={task.id}
          onClose={() => setEditing(false)}
        />
      )}

      <style>{`
        @keyframes projectRowPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
    </>
  );
}

function Pill({
  mode,
  color,
  sub,
}: {
  mode: ColumnMode;
  color: string;
  sub: string;
}) {
  const dotColor =
    mode === 'active'
      ? '#f59e0b'
      : mode === 'category'
        ? color || '#9ca3af'
        : '#9ca3af';
  const label =
    mode === 'active'
      ? 'ACTIVE'
      : mode === 'idle'
        ? 'IDLE'
        : mode === 'category'
          ? 'CATEGORY'
          : 'UNASSIGNED';

  return (
    <div className="flex items-center gap-2">
      <span
        className="w-[8px] h-[8px] rounded-full shrink-0"
        style={{ background: dotColor }}
      />
      <span
        className="text-[10px] font-mono uppercase tracking-[1px] font-bold"
        style={{ color: sub }}
      >
        {label}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  ink,
  sub,
  divider,
}: {
  label: string;
  value: string;
  ink: string;
  sub: string;
  divider?: string;
}) {
  return (
    <div style={divider ? { borderLeft: `1px solid ${divider}` } : undefined}>
      <div
        className="text-[10px] font-mono uppercase tracking-wider"
        style={{ color: sub }}
      >
        {label}
      </div>
      <div className="text-[14px] font-extrabold" style={{ color: ink }}>
        {value}
      </div>
    </div>
  );
}

function computeProgress(tasks: TaskType[]): number {
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((sum, t) => {
    if (t.effective_status === 'done') return sum + 100;
    if (t.subtasks.length === 0) return sum;
    const done = t.subtasks.filter((s) => s.is_done).length;
    return sum + Math.round((done / t.subtasks.length) * 100);
  }, 0);
  return Math.round(total / tasks.length);
}
