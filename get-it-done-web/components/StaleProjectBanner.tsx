'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/utils';
import type { TaskType } from '@/types';

interface Props {
  projectId: string;
  projectName: string;
  // Open (not done) tasks belonging to this project. Passed in by the parent
  // ProjectCard so we don't re-filter the store.
  openTasks: TaskType[];
  // ISO timestamp of the most recent tracked session ending on any task in
  // this project, or null if there's never been one. The banner computes the
  // "days ago" label itself (inside an effect) so we don't call Date.now()
  // during render and trip React 19's purity rule.
  lastActivityAt: string | null;
}

// Phase 1.4 — stale-project nudge. Amber dashed banner shown inside a project
// group on the List view when v_project_staleness says is_stale = true.
// Three actions: Drop in Matrix · Schedule today · Archive.
export function StaleProjectBanner({
  projectId,
  projectName,
  openTasks,
  lastActivityAt,
}: Props) {
  const showToast = useStore((s) => s.showToast);
  const setProjectStatus = useStore((s) => s.setProjectStatus);
  const updateTask = useStore((s) => s.updateTask);
  const [busy, setBusy] = useState<null | 'drop' | 'schedule' | 'archive'>(null);

  // Compute "days idle" once on mount via a lazy useState initializer. The
  // staleness threshold is in days, so this single-shot snapshot is fine —
  // we don't need to keep ticking the day count up while the banner is open.
  const [staleDays] = useState<number | null>(() => {
    if (!lastActivityAt) return null;
    return Math.floor(
      (Date.now() - new Date(lastActivityAt).getTime()) / (24 * 3600 * 1000),
    );
  });

  const labelDays = staleDays === null ? '—' : `${staleDays}d`;

  // Drop in Matrix: set matrix_quadrant='drop' on every OPEN task in the
  // project. Matrix view (Phase 3) reads this column to render its quadrants.
  // We write through Supabase directly because the store doesn't expose
  // matrix_quadrant yet — that arrives in Phase 3.
  const handleDrop = async () => {
    if (openTasks.length === 0) return;
    if (
      openTasks.length > 1 &&
      !confirm(
        `Move all ${openTasks.length} open tasks in "${projectName}" to the Matrix → Drop quadrant?`,
      )
    ) {
      return;
    }
    setBusy('drop');
    const ids = openTasks.map((t) => t.id);
    const { error } = await supabase()
      .from('tasks')
      .update({ matrix_quadrant: 'drop' })
      .in('id', ids);
    setBusy(null);
    if (error) {
      showToast(`Couldn't drop tasks: ${error.message}`);
      return;
    }
    showToast(
      `${ids.length} task${ids.length === 1 ? '' : 's'} moved to Matrix → Drop`,
    );
  };

  // Schedule today: stamp planned_for_date = today on every open task.
  // (Brief calls this "Schedule this week" with a multi-select; Phase 1 ships
  // the simplest form — all-or-nothing for today. Multi-day picker can land
  // in Phase 2 alongside the Today view.)
  const handleSchedule = async () => {
    if (openTasks.length === 0) return;
    if (
      openTasks.length > 5 &&
      !confirm(
        `"Today's 5" usually caps at 5. Schedule all ${openTasks.length} open tasks in "${projectName}" for today anyway?`,
      )
    ) {
      return;
    }
    setBusy('schedule');
    const today = todayISO();
    await Promise.all(
      openTasks.map((t) => updateTask(t.id, { planned_for_date: today })),
    );
    setBusy(null);
    showToast(
      `${openTasks.length} task${openTasks.length === 1 ? '' : 's'} scheduled for today`,
    );
  };

  const handleArchive = async () => {
    if (
      !confirm(
        `Archive "${projectName}"? It will be hidden from the board but the data stays.`,
      )
    ) {
      return;
    }
    setBusy('archive');
    await setProjectStatus(projectId, 'archived');
    setBusy(null);
    showToast(`"${projectName}" archived`);
  };

  return (
    <div
      className="rounded-xl p-3 mb-3 text-[12px]"
      style={{
        background: '#fffbeb',
        border: '1.5px dashed #f59e0b',
        color: '#92400e',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold tracking-[1px] px-[6px] py-[2px] rounded"
            style={{ background: '#f59e0b', color: '#fff' }}
          >
            ⏸ IDLE · {labelDays}
          </span>
          <span className="font-semibold">
            No activity for {labelDays}. Drop, schedule, or archive?
          </span>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleDrop}
          disabled={!!busy || openTasks.length === 0}
          className="text-[11px] font-bold px-[10px] py-[5px] rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: '#fff',
            border: '1px solid #f59e0b',
            color: '#92400e',
          }}
        >
          {busy === 'drop' ? 'Dropping…' : '→ Drop in Matrix'}
        </button>
        <button
          type="button"
          onClick={handleSchedule}
          disabled={!!busy || openTasks.length === 0}
          className="text-[11px] font-bold px-[10px] py-[5px] rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: '#fff',
            border: '1px solid #f59e0b',
            color: '#92400e',
          }}
        >
          {busy === 'schedule' ? 'Scheduling…' : '→ Schedule today'}
        </button>
        <button
          type="button"
          onClick={handleArchive}
          disabled={!!busy}
          className="text-[11px] font-bold px-[10px] py-[5px] rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: '#fff',
            border: '1px solid #c7c9d1',
            color: '#666',
          }}
        >
          {busy === 'archive' ? 'Archiving…' : 'Archive'}
        </button>
      </div>
    </div>
  );
}
