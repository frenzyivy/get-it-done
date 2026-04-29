'use client';

import { useCallback, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { useDismissOnOutside } from '@/lib/hooks/useDismissOnOutside';
import type { Filters, Priority } from '@/types';

type Dim = keyof Filters;

const DIMENSIONS: { id: Dim; label: string }[] = [
  { id: 'project_ids', label: 'Project' },
  { id: 'category_ids', label: 'Category' },
  { id: 'tag_ids', label: 'Tag' },
  { id: 'priorities', label: 'Priority' },
];

const PRIORITY_OPTIONS: { id: Priority; label: string }[] = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

// "+ Add filter" popover. Two-step: pick dimension, then pick value(s).
// Multi-select within a dimension; close on outside-click or Esc.
export function FilterPicker() {
  const [open, setOpen] = useState(false);
  const [dim, setDim] = useState<Dim | null>(null);
  const close = useCallback(() => {
    setOpen(false);
    setDim(null);
  }, []);
  const rootRef = useDismissOnOutside<HTMLDivElement>(open, close);

  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
  const tags = useStore((s) => s.tags);

  const items = useMemo(() => {
    if (dim === 'project_ids')
      return projects.map((p) => ({ id: p.id, label: p.name, color: p.color }));
    if (dim === 'category_ids')
      return categories.map((c) => ({ id: c.id, label: c.name, color: c.color }));
    if (dim === 'tag_ids')
      return tags.map((t) => ({ id: t.id, label: t.name, color: t.color }));
    if (dim === 'priorities')
      return PRIORITY_OPTIONS.map((p) => ({ id: p.id, label: p.label, color: '#1a1a2e' }));
    return [];
  }, [dim, projects, categories, tags]);

  const toggle = (id: string) => {
    if (!dim) return;
    const current = filters[dim] as string[];
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    setFilters({ ...filters, [dim]: next });
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-3 py-[6px] rounded-full border-[1.5px] border-dashed border-[#bbb] bg-transparent text-[#555] cursor-pointer font-medium hover:border-[#1a1a2e] hover:text-[#1a1a2e] transition-colors"
      >
        + Add filter
      </button>
      {open && (
        <div className="absolute top-[110%] left-0 z-50 bg-white rounded-xl p-2 min-w-[220px] shadow-[0_8px_30px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]">
          {!dim ? (
            <>
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] px-2 pb-1">
                Filter by
              </div>
              {DIMENSIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDim(d.id)}
                  className="block w-full text-left px-2 py-[6px] rounded-md border-0 bg-transparent text-[13px] cursor-pointer hover:bg-black/[.04]"
                >
                  {d.label}
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDim(null)}
                className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] px-2 pb-1 bg-transparent border-0 cursor-pointer hover:text-[#1a1a2e]"
              >
                ← Filter by
              </button>
              <div className="max-h-[240px] overflow-y-auto">
                {items.length === 0 && (
                  <div className="text-[11px] text-[#9ca3af] px-2 py-2">
                    Nothing to choose yet.
                  </div>
                )}
                {items.map((it) => {
                  const arr = filters[dim] as string[];
                  const checked = arr.includes(it.id);
                  return (
                    <div
                      key={it.id}
                      onClick={() => toggle(it.id)}
                      className="flex items-center gap-2 px-[6px] py-[5px] rounded-md cursor-pointer text-[13px] hover:bg-black/[.03]"
                    >
                      <span
                        className="w-4 h-4 rounded flex items-center justify-center text-white text-[10px] shrink-0"
                        style={{
                          border: checked ? 'none' : '2px solid #ddd',
                          background: checked ? it.color : 'transparent',
                        }}
                      >
                        {checked ? '✓' : ''}
                      </span>
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: it.color }}
                      />
                      <span>{it.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] font-mono text-[#9ca3af] text-center pt-1 lowercase tracking-wider border-t border-[#eee] mt-1">
                click outside or press esc to close
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
