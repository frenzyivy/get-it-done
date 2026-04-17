'use client';

import { useState } from 'react';

export function AddSubtask({ onAdd }: { onAdd: (title: string) => void }) {
  const [val, setVal] = useState('');
  const submit = () => {
    const next = val.trim();
    if (!next) return;
    onAdd(next);
    setVal('');
  };

  return (
    <div className="flex gap-[6px] mt-[6px]">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="+ Add subtask…"
        className="flex-1 border-[1.5px] border-[#e5e7eb] rounded-lg px-[10px] py-[6px] text-[13px] outline-none bg-[#fafafa]"
      />
      {val.trim() && (
        <button
          onClick={submit}
          className="bg-[#8b5cf6] text-white border-0 rounded-lg px-3 py-[6px] text-xs font-bold cursor-pointer"
        >
          Add
        </button>
      )}
    </div>
  );
}
