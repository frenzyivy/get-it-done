'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { TAG_COLORS } from '@/lib/constants';
import type { CategoryType } from '@/types';

interface Props {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

// Multi-select with inline "+ Create new category" — matches TagPicker's look
// so the modal doesn't mix patterns.
export function CategoryPicker({ selectedIds, onChange }: Props) {
  const [show, setShow] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(TAG_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const categories = useStore((s) => s.categories);
  const addCategory = useStore((s) => s.addCategory);

  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );

  const selectedCats = selectedIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is CategoryType => !!c);

  const create = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const cat = await addCategory(name, newColor);
      if (cat) onChange([...selectedIds, cat.id]);
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
        {selectedCats.length === 0 ? (
          <span>Category</span>
        ) : (
          <span className="flex items-center gap-[4px]">
            {selectedCats.slice(0, 3).map((c) => (
              <span
                key={c.id}
                className="w-[8px] h-[8px] rounded-full"
                style={{ background: c.color }}
              />
            ))}
            <span className="text-[#333] font-semibold">
              {selectedCats.length} selected
            </span>
          </span>
        )}{' '}
        ▾
      </button>
      {show && (
        <div className="absolute top-[110%] left-0 z-50 bg-white rounded-xl p-2 min-w-[220px] shadow-[0_8px_30px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]">
          {categories.length === 0 && !creating && (
            <div className="text-[11px] text-[#9ca3af] px-2 py-2">
              No categories yet.
            </div>
          )}
          {categories.map((c) => (
            <div
              key={c.id}
              onClick={() => toggle(c.id)}
              className="flex items-center gap-2 px-[6px] py-[5px] rounded-md cursor-pointer text-[13px] hover:bg-black/[.03]"
            >
              <span
                className="w-4 h-4 rounded flex items-center justify-center text-white text-[10px] shrink-0"
                style={{
                  border: selectedIds.includes(c.id) ? 'none' : '2px solid #ddd',
                  background: selectedIds.includes(c.id) ? c.color : 'transparent',
                }}
              >
                {selectedIds.includes(c.id) ? '✓' : ''}
              </span>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: c.color }}
              />
              <span>{c.name}</span>
            </div>
          ))}
          <div className="border-t border-[#eee] mt-1 pt-1">
            {creating ? (
              <div className="flex flex-col gap-1 p-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && create()}
                  placeholder="New category name…"
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
                + Create new category
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
