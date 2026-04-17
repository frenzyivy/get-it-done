'use client';

import { KANBAN_COLS } from '@/lib/constants';
import { useStore } from '@/lib/store';

// v2 spec §6 — segmented 3-tab replacing the 3-column kanban layout.
// Counts update live; sentence case; purple fill on active.
export function ColumnSwitcher() {
  const tasks = useStore((s) => s.tasks);
  const active = useStore((s) => s.activeColumn);
  const setActive = useStore((s) => s.setActiveColumn);

  return (
    <div className="flex bg-white rounded-xl p-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
      {KANBAN_COLS.map((col) => {
        const count = tasks.filter((t) => t.status === col.id).length;
        const on = active === col.id;
        return (
          <button
            key={col.id}
            onClick={() => setActive(col.id)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-[10px] border-0 cursor-pointer transition-all"
            style={{
              background: on ? '#8b5cf6' : 'transparent',
              color: on ? '#fff' : '#666',
            }}
          >
            <span className="text-[13px] font-bold">{col.label}</span>
            <span
              className="min-w-[22px] h-[22px] px-[6px] rounded-full text-[11px] font-bold flex items-center justify-center"
              style={{
                background: on ? 'rgba(255,255,255,0.25)' : col.accent + '18',
                color: on ? '#fff' : col.accent,
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
