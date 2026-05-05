'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { PRIORITY_ORDER } from '@/lib/constants';
import { toLocalDateISO, todayISO } from '@/lib/utils';
import type { TaskType } from '@/types';

// Feature 08 — bulk day-planner. The user picks a target date (Today / Tomorrow
// / next two weekdays / custom), ticks tasks, and we insert one planned_blocks
// row per checked task. Default times stack 1-hour blocks starting at 09:00,
// capped at 21:00–22:00 (matches the grid's END_HOUR=23). Drag interactions on
// the grid stay as the fine-tuning surface.

const DEFAULT_FIRST_HOUR = 9;
const LAST_START_HOUR = 21;
const LAST_END_HOUR = 22;

interface Row {
  taskId: string;
  checked: boolean;
  start: string;
  end: string;
  touched: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSavedForDate: (dateISO: string) => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function defaultTimesForIndex(i: number): { start: string; end: string } {
  const startH = Math.min(DEFAULT_FIRST_HOUR + i, LAST_START_HOUR);
  const endH = Math.min(DEFAULT_FIRST_HOUR + i + 1, LAST_END_HOUR);
  return { start: `${pad2(startH)}:00`, end: `${pad2(endH)}:00` };
}

function isValidHHMM(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

function fmtChip(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function chipLabel(offset: number, d: Date): string {
  if (offset === 0) return `Today · ${fmtChip(d)}`;
  if (offset === 1) return `Tomorrow · ${fmtChip(d)}`;
  const wk = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${wk} · ${fmtChip(d)}`;
}

export function CreateScheduleModal({ open, onClose, onSavedForDate }: Props) {
  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const addPlannedBlock = useStore((s) => s.addPlannedBlock);
  const showToast = useStore((s) => s.showToast);

  const today = todayISO();

  const [dateISO, setDateISO] = useState<string>(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Open tasks sorted: priority (urgent→low), then sort_order.
  const orderedTasks: TaskType[] = useMemo(() => {
    return tasks
      .filter((t) => t.effective_status !== 'done')
      .slice()
      .sort((a, b) => {
        const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (p !== 0) return p;
        return a.sort_order - b.sort_order;
      });
  }, [tasks]);

  // Task IDs already scheduled for the selected date — we still show them but
  // dim and float to the bottom (the user may want to add a second block).
  const scheduledForDate: Set<string> = useMemo(() => {
    const set = new Set<string>();
    for (const b of plannedBlocks) {
      if (!b.task_id) continue;
      const blockDateISO = toLocalDateISO(new Date(b.start_at));
      if (blockDateISO === dateISO) set.add(b.task_id);
    }
    return set;
  }, [plannedBlocks, dateISO]);

  const sortedTasks = useMemo(() => {
    return orderedTasks.slice().sort((a, b) => {
      const aSched = scheduledForDate.has(a.id) ? 1 : 0;
      const bSched = scheduledForDate.has(b.id) ? 1 : 0;
      return aSched - bSched;
    });
  }, [orderedTasks, scheduledForDate]);

  // Rebuild rows when modal opens. Stacks default times by display position so
  // the visible 1st row gets 09:00, 2nd gets 10:00, etc. We do NOT restack on
  // chip changes — the user can edit any row, and only freshly-opened modals
  // get fresh defaults.
  useEffect(() => {
    if (!open) return;
    setRows(
      sortedTasks.map((t, i) => ({
        taskId: t.id,
        checked: false,
        ...defaultTimesForIndex(i),
        touched: false,
      })),
    );
    setErrors({});
    setDateISO(today);
    // We deliberately depend on `open` only — opening the modal seeds rows
    // from the current task list snapshot. Re-renders due to task edits while
    // the modal is open shouldn't reset user selections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const chips = [0, 1, 2, 3].map((offset) => {
    const d = new Date(startOfToday);
    d.setDate(startOfToday.getDate() + offset);
    return { iso: toLocalDateISO(d), label: chipLabel(offset, d) };
  });

  const isPastDate = dateISO < today;
  const checkedCount = rows.filter((r) => r.checked).length;

  const setRow = (taskId: string, patch: Partial<Row>) => {
    setRows((prev) =>
      prev.map((r) => (r.taskId === taskId ? { ...r, ...patch } : r)),
    );
    if (errors[taskId]) {
      setErrors((prev) => {
        const { [taskId]: _drop, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleSave = async () => {
    const nextErrors: Record<string, string> = {};
    const validRows: { row: Row; durationSec: number; startAtISO: string }[] = [];

    for (const r of rows) {
      if (!r.checked) continue;
      if (!isValidHHMM(r.start) || !isValidHHMM(r.end)) {
        nextErrors[r.taskId] = 'Invalid time format';
        continue;
      }
      const startAt = new Date(`${dateISO}T${r.start}:00`);
      const endAt = new Date(`${dateISO}T${r.end}:00`);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        nextErrors[r.taskId] = 'Invalid time';
        continue;
      }
      const durationSec = Math.round((endAt.getTime() - startAt.getTime()) / 1000);
      if (durationSec <= 0) {
        nextErrors[r.taskId] = 'End must be after start';
        continue;
      }
      validRows.push({ row: r, durationSec, startAtISO: startAt.toISOString() });
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    if (validRows.length === 0) return;

    setSaving(true);
    try {
      // Sequential: addPlannedBlock re-sorts plannedBlocks after each insert;
      // concurrent inserts could race the local-state sort. Cost is negligible
      // for ~5–10 rows.
      for (const { row, durationSec, startAtISO } of validRows) {
        await addPlannedBlock({
          task_id: row.taskId,
          subtask_id: null,
          start_at: startAtISO,
          duration_seconds: durationSec,
          block_type: 'work',
          notes: null,
        });
      }
      onSavedForDate(dateISO);
      showToast(`Schedule saved · ${validRows.length} task${validRows.length === 1 ? '' : 's'} placed`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/40 animate-[fadeIn_0.15s_ease-out]" />
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Create schedule"
      >
        <div className="bg-white rounded-[16px] max-w-[640px] w-full max-h-[85vh] flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
          <div className="px-6 py-4 border-b border-[#eee] flex items-center justify-between">
            <div>
              <div className="text-[15px] font-extrabold text-[#1a1a2e]">
                Create schedule
              </div>
              <div className="text-[12px] text-[#666] mt-1">
                Plan a day in 30 seconds. Pick a date, tick tasks, set times.
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-[18px] text-[#888] hover:text-[#1a1a2e] cursor-pointer bg-transparent border-0 px-2"
            >
              ×
            </button>
          </div>

          <div className="px-6 py-4 border-b border-[#eee]">
            <div className="text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af] mb-2">
              Plan for
            </div>
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => {
                const active = chip.iso === dateISO;
                return (
                  <button
                    key={chip.iso}
                    onClick={() => setDateISO(chip.iso)}
                    aria-pressed={active}
                    className={`text-[12px] font-bold px-3 py-1.5 rounded-full border cursor-pointer ${
                      active
                        ? 'bg-[#1a1a2e] text-white border-[#1a1a2e]'
                        : 'bg-white text-[#1a1a2e] border-[#e5e7eb] hover:bg-black/[.03]'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <label className="text-[11px] text-[#666] font-bold">Or any date</label>
              <input
                type="date"
                value={dateISO}
                onChange={(e) => setDateISO(e.target.value)}
                className="text-[12px] px-2 py-1 border border-[#e5e7eb] rounded-md text-[#1a1a2e] bg-white"
              />
            </div>
            {isPastDate && (
              <div className="text-[11px] text-[#d97706] mt-2">
                Past date — block will be created in the past.
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af]">
              Tasks for that day
            </div>
            {rows.length === 0 ? (
              <div className="px-4 py-8 text-[12px] text-[#9ca3af] text-center">
                No open tasks. Add one on the Board.
              </div>
            ) : (
              rows.map((r) => {
                const task = tasks.find((t) => t.id === r.taskId);
                if (!task) return null;
                const alreadyScheduled = scheduledForDate.has(r.taskId);
                const err = errors[r.taskId];
                return (
                  <div
                    key={r.taskId}
                    className={`flex items-center gap-3 px-4 py-[10px] rounded-lg ${
                      err ? 'ring-1 ring-[#dc2626] bg-[#fff5f5]' : ''
                    }`}
                    style={{ opacity: alreadyScheduled ? 0.6 : 1 }}
                  >
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={(e) => setRow(r.taskId, { checked: e.target.checked })}
                      className="w-4 h-4 accent-[#1a1a2e] cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-[#1a1a2e] truncate">
                        {task.title}
                      </div>
                      {alreadyScheduled && (
                        <div className="text-[10px] text-[#888] mt-[1px]">
                          Already scheduled for this day
                        </div>
                      )}
                      {err && (
                        <div className="text-[10px] text-[#dc2626] mt-[1px]">{err}</div>
                      )}
                    </div>
                    <input
                      type="time"
                      step={900}
                      value={r.start}
                      onChange={(e) => setRow(r.taskId, { start: e.target.value, touched: true })}
                      className="text-[12px] px-2 py-1 border border-[#e5e7eb] rounded-md tabular-nums bg-white text-[#1a1a2e]"
                    />
                    <span className="text-[12px] text-[#888]">–</span>
                    <input
                      type="time"
                      step={900}
                      value={r.end}
                      onChange={(e) => setRow(r.taskId, { end: e.target.value, touched: true })}
                      className={`text-[12px] px-2 py-1 border rounded-md tabular-nums bg-white text-[#1a1a2e] ${
                        err ? 'border-[#dc2626]' : 'border-[#e5e7eb]'
                      }`}
                      title={err ?? undefined}
                    />
                  </div>
                );
              })
            )}
          </div>

          <div className="px-6 py-4 border-t border-[#eee] flex items-center justify-between gap-3 bg-[#fafafa] rounded-b-[16px]">
            <div className="text-[11px] text-[#888]">
              Drag blocks once placed to fine-tune timing
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-transparent border-0 text-[#666] text-[13px] font-bold cursor-pointer hover:bg-black/[.04]"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={checkedCount === 0 || saving}
                className="px-4 py-2 rounded-lg bg-[#1a1a2e] text-white border-0 text-[13px] font-bold cursor-pointer"
                style={{ opacity: checkedCount === 0 || saving ? 0.5 : 1 }}
              >
                {saving ? 'Saving…' : `Save schedule${checkedCount > 0 ? ` · ${checkedCount}` : ''}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
