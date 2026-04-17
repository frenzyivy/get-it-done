'use client';

import { useStore } from '@/lib/store';
import type { ViewMode } from '@/types';

const OPTIONS: { id: ViewMode; icon: string; label: string }[] = [
  { id: 'list', icon: '☰', label: 'List' },
  { id: 'kanban', icon: '▤', label: 'Board' },
];

export function ViewToggle() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  return (
    <div className="flex bg-white rounded-xl p-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
      {OPTIONS.map((v) => (
        <button
          key={v.id}
          onClick={() => setView(v.id)}
          className="px-4 py-[7px] rounded-[10px] border-0 cursor-pointer text-[13px] font-bold transition-all"
          style={{
            background: view === v.id ? '#8b5cf6' : 'transparent',
            color: view === v.id ? '#fff' : '#888',
          }}
        >
          {v.icon} {v.label}
        </button>
      ))}
    </div>
  );
}
