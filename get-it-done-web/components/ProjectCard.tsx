'use client';

import { fmtShort } from '@/lib/utils';
import { TaskCard } from './TaskCard';
import { AddTaskForm } from './AddTaskForm';
import type { TaskType } from '@/types';

type ColumnMode = 'active' | 'idle' | 'category' | 'unassigned';

interface Props {
  // Card label (project name OR category name OR "Unassigned").
  label: string;
  // Hex color for the dot/accent. Empty string = neutral grey.
  color: string;
  tasks: TaskType[];
  // Project mode drives both the pill (ACTIVE/IDLE/CATEGORY/UNASSIGNED) and
  // the dark-navy "current focus" card background. 'active' = a running
  // tracked session belongs to a task in this project.
  mode: ColumnMode;
  // The "+ Add task to [label]" button auto-attaches to this project. null
  // for category cards or the Unassigned bucket — those don't pre-attach.
  addProjectId: string | null;
}

export function ProjectCard({
  label,
  color,
  tasks,
  mode,
  addProjectId,
}: Props) {
  const isActive = mode === 'active';
  const tasksShort = tasks.length < 4;

  // Stats from the already-loaded task list — no extra fetches.
  const tracked = tasks.reduce((sum, t) => sum + t.total_time_seconds, 0);
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

      {tasks.length > 0 && (
        <div className="flex flex-col gap-[6px] max-h-[360px] overflow-y-auto pr-1">
          {tasks.map((t) => (
            <div
              key={t.id}
              style={{
                opacity: t.effective_status === 'done' ? 0.55 : 1,
              }}
            >
              <TaskCard task={t} compact />
            </div>
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
    <div
      style={
        divider ? { borderLeft: `1px solid ${divider}` } : undefined
      }
    >
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

// Mean of subtask completion %. Tasks with no subtasks count as 0% (not done)
// or 100% (done). Done tasks always count as 100% even if subtasks are partial.
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
