'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { todayISO } from '@/lib/utils';
import type { TaskType } from '@/types';

// On first open of a new day, surface every past-planned-but-not-done task so
// the user can decide which to bring to today. Skip-all is also allowed; either
// button writes today's ISO into user_profiles.last_rollover_prompt_date so
// this modal doesn't fire again the same day.
export function RolloverPromptModal() {
  const tasks = useStore((s) => s.tasks);
  const profileV2 = useStore((s) => s.profileV2);
  const setPlannedForDateBulk = useStore((s) => s.setPlannedForDateBulk);
  const updateRolloverPromptDate = useStore((s) => s.updateRolloverPromptDate);

  const today = todayISO();

  const candidates: TaskType[] = useMemo(() => {
    return tasks
      .filter(
        (t) =>
          t.planned_for_date !== null &&
          t.planned_for_date < today &&
          t.status !== 'done',
      )
      .sort((a, b) => {
        // Newest planned date first, then by priority-as-tiebreaker.
        if (a.planned_for_date! > b.planned_for_date!) return -1;
        if (a.planned_for_date! < b.planned_for_date!) return 1;
        return a.sort_order - b.sort_order;
      });
  }, [tasks, today]);

  const shouldShow =
    !!profileV2 &&
    profileV2.last_rollover_prompt_date !== today &&
    candidates.length > 0;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Default-select every candidate when the modal becomes eligible.
  useEffect(() => {
    if (shouldShow) {
      setSelected(new Set(candidates.map((t) => t.id)));
    }
  }, [shouldShow, candidates]);

  if (!shouldShow) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSkipAll = async () => {
    await updateRolloverPromptDate(today);
  };

  const handleConfirm = async () => {
    const updates = Array.from(selected).map((id) => ({
      id,
      planned_for_date: today,
    }));
    if (updates.length > 0) {
      await setPlannedForDateBulk(updates);
    }
    await updateRolloverPromptDate(today);
  };

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/40 animate-[fadeIn_0.15s_ease-out]" />
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Rollover prompt"
      >
        <div className="bg-white rounded-[16px] max-w-[520px] w-full max-h-[80vh] flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
          <div className="px-6 py-4 border-b border-[#eee]">
            <div className="text-[15px] font-extrabold text-[#1a1a2e]">
              Bring unfinished tasks to today?
            </div>
            <div className="text-[12px] text-[#666] mt-1">
              {candidates.length} task{candidates.length === 1 ? '' : 's'} from
              previous days weren&apos;t completed. Pick which to carry to today&apos;s
              plan.
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {candidates.map((t) => {
              const checked = selected.has(t.id);
              return (
                <label
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-[10px] rounded-lg cursor-pointer hover:bg-black/[.03]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(t.id)}
                    className="w-4 h-4 accent-[#8b5cf6] cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-[#1a1a2e] truncate">
                      {t.title}
                    </div>
                    <div className="text-[11px] text-[#888] mt-[1px]">
                      Planned for {t.planned_for_date}
                      {t.priority !== 'low' && ` · ${t.priority}`}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="px-6 py-4 border-t border-[#eee] flex items-center justify-between gap-3 bg-[#fafafa] rounded-b-[16px]">
            <div className="text-[11px] text-[#888]">
              {selected.size} selected
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSkipAll}
                className="px-4 py-2 rounded-lg bg-transparent border-0 text-[#666] text-[13px] font-bold cursor-pointer hover:bg-black/[.04]"
              >
                Skip all
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 rounded-lg bg-[#8b5cf6] text-white border-0 text-[13px] font-bold cursor-pointer"
                disabled={selected.size === 0}
                style={{ opacity: selected.size === 0 ? 0.5 : 1 }}
              >
                Bring {selected.size} to today
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
