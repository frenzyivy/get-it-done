'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { PriorityTaskCard } from './PriorityTaskCard';
import { AddTaskForm } from './AddTaskForm';
import type { Priority, TaskType } from '@/types';

interface Props {
  // Lane label shown in the header (e.g. "Urgent", "High", "Medium", "Low").
  label: string;
  // Priority value the lane's "+ Add" button stamps onto new tasks.
  addPriority: Priority;
  tasks: TaskType[];
  // Urgent lane is the "current focus" black card per spec §6 visual rule.
  variant: 'black' | 'frost';
  // Optional accent color (matches PRIORITIES palette) — drives a top stripe
  // on frost lanes so High/Medium/Low are visually distinct.
  accent?: string;
  // Feature 7 — when present, the lane registers as a @dnd-kit drop target
  // with this id. Used by PriorityView's DndContext to route search-result
  // drops into priority changes.
  dropId?: string;
}

// Spec Change #5 — single priority swimlane. Compact task cards (no progress
// bar by default), local "Hide done" toggle, "+ Add" button auto-stamps the
// lane's priority. Filter inheritance still flows through AddTaskForm.
export function PriorityColumn({ label, addPriority, tasks, variant, accent, dropId }: Props) {
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

  // Feature 7 — droppable lane for search-result drags. Falls back to a
  // no-op id when dropId isn't provided so existing call sites are unaffected.
  const { isOver, setNodeRef } = useDroppable({
    id: dropId ?? `priority-noop-${addPriority}`,
    disabled: !dropId,
  });

  return (
    <div
      ref={setNodeRef}
      className="rounded-2xl p-[14px] flex flex-col gap-[10px] min-h-[200px] relative overflow-hidden transition-colors"
      style={{
        background: cardBg,
        border: isOver
          ? '1.5px dashed #1a1a2e'
          : isBlack
            ? '1px solid rgba(255,255,255,0.08)'
            : '1px solid rgba(0,0,0,0.06)',
        boxShadow: isBlack
          ? '0 8px 30px rgba(0,0,0,0.18)'
          : '0 1px 4px rgba(0,0,0,0.04)',
        backdropFilter: isBlack ? undefined : 'blur(8px)',
      }}
    >
      {!isBlack && accent && (
        <span
          aria-hidden
          className="absolute left-0 right-0 top-0 h-[3px]"
          style={{ background: accent }}
        />
      )}
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
              <PriorityTaskCard task={t} />
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
