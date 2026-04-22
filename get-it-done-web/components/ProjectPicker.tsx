'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { TAG_COLORS } from '@/lib/constants';
import type { ProjectType } from '@/types';

interface Props {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

// Multi-select + search. Active projects only by default; "Show archived" reveals
// paused/archived. Inline "+ Create new project" creates an active project and
// preselects it.
export function ProjectPicker({ selectedIds, onChange }: Props) {
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(TAG_COLORS[2]);
  const [busy, setBusy] = useState(false);
  const projects = useStore((s) => s.projects);
  const addProject = useStore((s) => s.addProject);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects
      .filter((p) => (showArchived ? true : p.status !== 'archived'))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true));
  }, [projects, search, showArchived]);

  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );

  const selectedProjs = selectedIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is ProjectType => !!p);

  const create = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const proj = await addProject(name, newColor, 'active');
      if (proj) onChange([...selectedIds, proj.id]);
      setNewName('');
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="text-xs px-[10px] py-1 rounded-lg border-[1.5px] border-[#e5e7eb] cursor-pointer bg-white text-[#666] inline-flex items-center gap-[6px]"
      >
        {selectedProjs.length === 0 ? (
          <span>Project</span>
        ) : (
          <span className="flex items-center gap-[4px]">
            {selectedProjs.slice(0, 3).map((p) => (
              <span
                key={p.id}
                className="w-[8px] h-[8px] rounded-full"
                style={{ background: p.color }}
              />
            ))}
            <span className="text-[#333] font-semibold">
              {selectedProjs.length} selected
            </span>
          </span>
        )}{' '}
        ▾
      </button>
      {show && (
        <div className="absolute top-[110%] left-0 z-50 bg-white rounded-xl p-2 min-w-[240px] shadow-[0_8px_30px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="w-full border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-[5px] text-xs outline-none mb-1"
          />
          <div className="max-h-[220px] overflow-y-auto">
            {filtered.length === 0 && !creating && (
              <div className="text-[11px] text-[#9ca3af] px-2 py-2">
                No matches.
              </div>
            )}
            {filtered.map((p) => (
              <div
                key={p.id}
                onClick={() => toggle(p.id)}
                className="flex items-center gap-2 px-[6px] py-[5px] rounded-md cursor-pointer text-[13px] hover:bg-black/[.03]"
              >
                <span
                  className="w-4 h-4 rounded flex items-center justify-center text-white text-[10px] shrink-0"
                  style={{
                    border: selectedIds.includes(p.id) ? 'none' : '2px solid #ddd',
                    background: selectedIds.includes(p.id) ? p.color : 'transparent',
                  }}
                >
                  {selectedIds.includes(p.id) ? '✓' : ''}
                </span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: p.color }}
                />
                <span className="flex-1">{p.name}</span>
                {p.status !== 'active' && (
                  <span className="text-[10px] uppercase tracking-wider text-[#9ca3af]">
                    {p.status}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-[#eee] mt-1 pt-1">
            <label className="flex items-center gap-2 px-2 py-1 cursor-pointer text-[11px] text-[#6b7280]">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="cursor-pointer accent-[#8b5cf6]"
              />
              Show archived
            </label>
            {creating ? (
              <div className="flex flex-col gap-1 p-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && create()}
                  placeholder="New project name…"
                  className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-[5px] text-xs outline-none"
                />
                <div className="flex gap-[4px] flex-wrap px-[2px]">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className="w-4 h-4 rounded-full cursor-pointer"
                      style={{
                        background: c,
                        outline: newColor === c ? '2px solid #1a1a2e' : 'none',
                        outlineOffset: 1,
                      }}
                      aria-label={`Pick color ${c}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setNewName('');
                    }}
                    className="text-[11px] text-[#888] bg-transparent border-0 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={create}
                    disabled={!newName.trim() || busy}
                    className="text-[11px] font-bold text-white bg-[#8b5cf6] border-0 px-2 py-[3px] rounded-md cursor-pointer disabled:opacity-50"
                  >
                    {busy ? '…' : 'Create'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full text-left px-2 py-1 border-0 bg-transparent text-xs text-[#8b5cf6] font-bold cursor-pointer"
              >
                + Create new project
              </button>
            )}
            <button
              type="button"
              onClick={() => setShow(false)}
              className="w-full py-1 border-0 bg-transparent text-xs text-[#6b7280] cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
