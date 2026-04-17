'use client';

import { useState } from 'react';
import type { TagType } from '@/types';

interface Props {
  tags: TagType[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function TagPicker({ tags, selectedIds, onChange }: Props) {
  const [show, setShow] = useState(false);
  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );

  return (
    <div className="relative">
      <button
        onClick={() => setShow((v) => !v)}
        className="text-xs px-[10px] py-1 rounded-lg border-[1.5px] border-[#e5e7eb] cursor-pointer bg-white text-[#666]"
      >
        {selectedIds.length ? `${selectedIds.length} tag${selectedIds.length > 1 ? 's' : ''}` : 'Tags'}{' '}
        ▾
      </button>
      {show && (
        <div className="absolute top-[110%] left-0 z-50 bg-white rounded-xl p-2 min-w-[180px] shadow-[0_8px_30px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]">
          {tags.map((t) => (
            <div
              key={t.id}
              onClick={() => toggle(t.id)}
              className="flex items-center gap-2 px-[6px] py-[5px] rounded-md cursor-pointer text-[13px] hover:bg-black/[.03]"
            >
              <span
                className="w-4 h-4 rounded flex items-center justify-center text-white text-[10px] shrink-0"
                style={{
                  border: selectedIds.includes(t.id) ? 'none' : '2px solid #ddd',
                  background: selectedIds.includes(t.id) ? t.color : 'transparent',
                }}
              >
                {selectedIds.includes(t.id) ? '✓' : ''}
              </span>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: t.color }}
              />
              <span>{t.name}</span>
            </div>
          ))}
          <div className="border-t border-[#eee] mt-1 pt-1">
            <button
              onClick={() => setShow(false)}
              className="w-full py-1 border-0 bg-transparent text-xs text-[#8b5cf6] font-bold cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
