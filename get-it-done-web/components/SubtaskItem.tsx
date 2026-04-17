'use client';

import { useState } from 'react';
import { fmtShort } from '@/lib/utils';
import type { SubtaskType } from '@/types';

interface Props {
  subtask: SubtaskType;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

export function SubtaskItem({ subtask, onToggle, onDelete, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(subtask.title);

  const commit = () => {
    const next = val.trim();
    if (next && next !== subtask.title) onRename(next);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 py-[5px] border-b border-black/[.04]">
      <button
        onClick={onToggle}
        className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-white text-xs shrink-0 transition-all cursor-pointer"
        style={{
          border: subtask.is_done ? 'none' : '2px solid #ccc',
          background: subtask.is_done ? '#10b981' : 'transparent',
        }}
      >
        {subtask.is_done ? '✓' : ''}
      </button>
      {editing ? (
        <input
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setVal(subtask.title);
              setEditing(false);
            }
          }}
          className="flex-1 border-0 border-b-[1.5px] border-[#8b5cf6] outline-none text-[13px] py-[2px] bg-transparent"
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          className={`flex-1 text-[13px] cursor-pointer transition-colors ${
            subtask.is_done ? 'line-through text-[#aaa]' : 'text-[#333]'
          }`}
        >
          {subtask.title}
        </span>
      )}
      {subtask.total_time_seconds > 0 && (
        <span className="text-[10px] font-bold text-[#8b5cf6] bg-[rgba(139,92,246,0.08)] px-[6px] py-[1px] rounded-[5px] whitespace-nowrap shrink-0">
          🕐 {fmtShort(subtask.total_time_seconds)}
        </span>
      )}
      <button
        onClick={onDelete}
        className="bg-transparent border-0 text-[#ccc] cursor-pointer text-sm p-0 leading-none hover:text-[#dc2626]"
        title="Remove"
      >
        ×
      </button>
    </div>
  );
}
