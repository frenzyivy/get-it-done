'use client';

import { fmtShort } from '@/lib/utils';
import { TaskCard } from './TaskCard';
import { AddTaskForm } from './AddTaskForm';
import type { TaskType } from '@/types';

interface Props {
  // Card label (project name OR category name OR "Unassigned").
  label: string;
  // Hex color for the dot/accent. Empty string = neutral grey.
  color: string;
  tasks: TaskType[];
  // Active timer landed on a task in this group → black "current focus" card.
  isActive: boolean;
  // The "+ Add task to [label]" button auto-attaches to this project. null
  // for category cards or the Unassigned bucket — those don't pre-attach.
  addProjectId: string | null;
  // Status row label override ("Active" for projects; "Category" / etc.).
  statusLabel?: string;
}

// Spec §6 — Project-grouped square card. Compact variant (<4 tasks) hides
// the stats row and uses a shorter min-height.
export function ProjectCard({
  label,
  color,
  tasks,
  isActive,
  addProjectId,
  statusLabel = 'Active',
}: Props) {
  const compact = tasks.length < 4;

  // Stats from the already-loaded task list — no extra fetches.
  const tracked = tasks.reduce((sum, t) => sum + t.total_time_seconds, 0);
  const open = tasks.filter((t) => t.effective_status !== 'done').length;
  const done = tasks.filter((t) => t.effective_status === 'done').length;
  const progress = computeProgress(tasks);

  const cardBg = isActive ? '#1a1a2e' : 'rgba(255,255,255,0.7)';
  const ink = isActive ? '#fff' : '#1a1a2e';
  const sub = isActive ? 'rgba(255,255,255,0.55)' : '#888';
  const dotColor = color || (isActive ? 'rgba(255,255,255,0.7)' : '#9ca3af');

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
        minHeight: compact ? 180 : 280,
      }}
    >
      {/* Status row — dot + label + count */}
      <div className="flex items-center gap-2">
        <span
          className="w-[8px] h-[8px] rounded-full shrink-0"
          style={{ background: dotColor }}
        />
        <span
          className="text-[10px] font-mono uppercase tracking-[1px] font-bold"
          style={{ color: sub }}
        >
          {statusLabel}
        </span>
        <span
          className="ml-auto text-[10px] font-mono"
          style={{ color: sub }}
        >
          {tasks.length} task{tasks.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Project / category name */}
      <div className="font-extrabold text-[16px]" style={{ color: ink }}>
        {label}
      </div>

      {/* Progress bar + % */}
      <div>
        <div
          className="rounded-full h-[6px] overflow-hidden"
          style={{
            background: isActive
              ? 'rgba(255,255,255,0.12)'
              : 'rgba(0,0,0,0.06)',
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: isActive ? '#fff' : '#1a1a2e',
            }}
          />
        </div>
        <div className="text-[11px] mt-[3px]" style={{ color: sub }}>
          {progress}% complete
        </div>
      </div>

      {/* Stats — hidden on compact (<4 tasks) variant per spec §6 */}
      {!compact && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Tracked" value={fmtShort(tracked)} ink={ink} sub={sub} />
          <Stat label="Open" value={String(open)} ink={ink} sub={sub} />
          <Stat label="Done" value={String(done)} ink={ink} sub={sub} />
        </div>
      )}

      {/* Inline scrollable task list. Capped at ~360px so the card stays
          square-ish; longer lists scroll inside. */}
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

function Stat({
  label,
  value,
  ink,
  sub,
}: {
  label: string;
  value: string;
  ink: string;
  sub: string;
}) {
  return (
    <div>
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
