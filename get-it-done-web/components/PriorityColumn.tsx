'use client';

import { useState } from 'react';
import { TaskCard } from './TaskCard';
import { AddTaskForm } from './AddTaskForm';
import type { Priority, TaskType } from '@/types';

interface Props {
  // Lane label shown in the header (e.g. "Urgent", "Med", "Low").
  label: string;
  // Priority value the lane's "+ Add" button stamps onto new tasks. Tasks are
  // already partitioned by the parent (so the lane can group multiple
  // priorities, like Med = high+medium); this is just the new-task stamp.
  addPriority: Priority;
  tasks: TaskType[];
  // Urgent lane is the "current focus" black card per spec §6 visual rule.
  variant: 'black' | 'frost';
}

// Spec Change #5 — single priority swimlane. Compact task cards (no progress
// bar by default), local "Hide done" toggle, "+ Add" button auto-stamps the
// lane's priority. Filter inheritance still flows through AddTaskForm.
export function PriorityColumn({ label, addPriority, tasks, variant }: Props) {
  const [hideDone, setHideDone] = useState(false);

  const visibleTasks = hideDone
    ? tasks.filter((t) => t.effective_status !== 'done')
    : tasks;
  const doneCount = tasks.filter((t) => t.effective_status === 'done').length;

  const isBlack = variant === 'black';
  const cardBg = isBlack
    ? '#1a1a2e'
    : 'rgba(255,255,255,0.7)';
  const headerColor = isBlack ? '#fff' : '#1a1a2e';
  const subColor = isBlack ? 'rgba(255,255,255,0.55)' : '#888';

  return (
    <div
      className="rounded-2xl p-[14px] flex flex-col gap-[10px] min-h-[200px]"
      style={{
        background: cardBg,
        border: isBlack
          ? '1px solid rgba(255,255,255,0.08)'
          : '1px solid rgba(0,0,0,0.06)',
        boxShadow: isBlack
          ? '0 8px 30px rgba(0,0,0,0.18)'
          : '0 1px 4px rgba(0,0,0,0.04)',
        backdropFilter: isBlack ? undefined : 'blur(8px)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="font-mono uppercase text-[11px] tracking-[1px] font-bold"
          style={{ color: headerColor }}
        >
          {label}
        </span>
        <span
          className="ml-auto text-[11px] font-mono"
          style={{ color: subColor }}
        >
          {visibleTasks.length}
        </span>
      </div>
      {doneCount > 0 && (
        <label
          className="flex items-center gap-[6px] text-[11px] cursor-pointer select-none"
          style={{ color: subColor }}
        >
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
            className="cursor-pointer accent-[#1a1a2e]"
          />
          Hide done ({doneCount})
        </label>
      )}
      <div className="flex flex-col gap-[10px]">
        {visibleTasks.length === 0 ? (
          <p
            className="text-center text-[12px] py-2"
            style={{ color: subColor }}
          >
            No tasks
          </p>
        ) : (
          visibleTasks.map((t) => (
            <div
              key={t.id}
              style={{
                opacity: t.effective_status === 'done' ? 0.55 : 1,
                transition: 'opacity 200ms',
              }}
            >
              <TaskCard task={t} compact />
            </div>
          ))
        )}
      </div>
      <div className="mt-auto pt-1">
        <AddTaskForm
          defaultPriority={addPriority}
          triggerLabel={`+ Add ${label} task`}
        />
      </div>
    </div>
  );
}
