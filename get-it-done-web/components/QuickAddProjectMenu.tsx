'use client';

import { useMemo } from 'react';
import type { ProjectType, TaskType } from '@/types';

export interface QuickAddProjectMenuProps {
  query: string;
  projects: ProjectType[];
  tasks: TaskType[];
  selectedIndex: number;
  onSelectedIndexChange: (idx: number) => void;
  onPick: (project: ProjectType) => void;
}

export function QuickAddProjectMenu({
  query,
  projects,
  tasks,
  selectedIndex,
  onSelectedIndexChange,
  onPick,
}: QuickAddProjectMenuProps) {
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter((p) => p.name.toLowerCase().startsWith(q));
  }, [projects, query]);

  const taskCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      for (const id of t.project_ids) {
        map.set(id, (map.get(id) ?? 0) + 1);
      }
    }
    return map;
  }, [tasks]);

  return (
    <div
      className="mt-3 max-h-[260px] overflow-y-auto"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: 10,
      }}
      role="listbox"
      aria-label="Project suggestions"
    >
      <div className="text-[10px] font-mono uppercase tracking-[1.5px] text-white/45 mb-2 px-1">
        {query
          ? `Projects starting with "${query}"`
          : 'All projects · pick one to assign'}
      </div>

      {filtered.length === 0 ? (
        <div className="px-2 py-2 text-[12px] italic text-white/55">
          No projects start with “{query}”
        </div>
      ) : (
        filtered.map((p, idx) => {
          const isSel = idx === selectedIndex;
          const count = taskCounts.get(p.id) ?? 0;
          return (
            <div
              key={p.id}
              role="option"
              aria-selected={isSel}
              onMouseEnter={() => onSelectedIndexChange(idx)}
              onMouseDown={(e) => {
                // mousedown (not click) so the input doesn't blur first.
                e.preventDefault();
                onPick(p);
              }}
              className="flex items-center gap-2 px-2 py-[6px] rounded-[8px] cursor-pointer text-[13px]"
              style={{
                background: isSel ? 'rgba(255,255,255,0.10)' : 'transparent',
                color: '#fff',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: p.color,
                  flexShrink: 0,
                }}
              />
              <span className="truncate flex-1">{p.name}</span>
              <span className="text-[11px] font-mono text-white/40 tabular-nums">
                {count}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
