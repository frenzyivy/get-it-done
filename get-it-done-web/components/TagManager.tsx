'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { TAG_COLORS } from '@/lib/constants';

export function TagManager() {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const tags = useStore((s) => s.tags);
  const addTag = useStore((s) => s.addTag);
  const deleteTag = useStore((s) => s.deleteTag);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const color = TAG_COLORS[tags.length % TAG_COLORS.length];
    await addTag(name, color);
    setNewName('');
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-[5px] rounded-lg border-[1.5px] border-[#e5e7eb] text-xs font-bold cursor-pointer transition-all"
        style={{
          background: open ? '#8b5cf6' : '#fff',
          color: open ? '#fff' : '#666',
        }}
      >
        ⚙ Tags ({tags.length})
      </button>
      {open && (
        <div className="absolute top-[110%] right-0 z-50 bg-white rounded-[14px] p-[14px] min-w-[230px] shadow-[0_8px_30px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]">
          <div className="text-xs font-extrabold text-[#1a1a2e] mb-2 uppercase tracking-[0.5px]">
            Manage Tags
          </div>
          {tags.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-1 py-[5px] rounded-md">
              <span
                className="w-[10px] h-[10px] rounded-full shrink-0"
                style={{ background: t.color }}
              />
              <span className="flex-1 text-[13px]">{t.name}</span>
              <button
                onClick={() => deleteTag(t.id)}
                className="bg-transparent border-0 text-[#ccc] cursor-pointer text-sm p-0 hover:text-[#dc2626]"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex gap-[6px] mt-2 border-t border-[#eee] pt-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="New tag name…"
              className="flex-1 border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-[5px] text-xs outline-none"
            />
            {newName.trim() && (
              <button
                onClick={create}
                className="bg-[#8b5cf6] text-white border-0 rounded-lg px-[10px] py-[5px] text-[11px] font-bold cursor-pointer"
              >
                +
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
