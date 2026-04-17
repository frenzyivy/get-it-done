'use client';

import { useState } from 'react';
import { PRIORITIES } from '@/lib/constants';
import { useStore } from '@/lib/store';
import { TagPicker } from './TagPicker';
import type { Priority, Status } from '@/types';

interface Props {
  defaultStatus?: Status;
}

export function AddTaskForm({ defaultStatus = 'todo' }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [estimateMin, setEstimateMin] = useState<number | null>(null);
  const tags = useStore((s) => s.tags);
  const addTask = useStore((s) => s.addTask);

  const reset = () => {
    setTitle('');
    setPriority('medium');
    setTagIds([]);
    setDueDate('');
    setEstimateMin(null);
    setOpen(false);
  };

  const submit = async () => {
    if (!title.trim()) return;
    await addTask({
      title: title.trim(),
      priority,
      tag_ids: tagIds,
      due_date: dueDate || null,
      status: defaultStatus,
      estimated_seconds: estimateMin ? estimateMin * 60 : null,
    });
    reset();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full px-[14px] py-[10px] rounded-xl cursor-pointer text-[#8b5cf6] font-bold text-[13px] transition-all"
        style={{
          background: 'rgba(139,92,246,0.06)',
          border: '2px dashed rgba(139,92,246,0.25)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(139,92,246,0.12)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(139,92,246,0.06)';
        }}
      >
        + New Task
      </button>
    );
  }

  return (
    <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_2px_rgba(139,92,246,0.2)]">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Task title…"
        className="w-full border-0 border-b-2 border-[#e5e7eb] text-[15px] font-semibold py-[6px] outline-none bg-transparent box-border"
      />
      <div className="flex gap-2 mt-[10px] flex-wrap items-center">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="text-xs px-2 py-1 rounded-lg border-[1.5px] border-[#e5e7eb]"
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label} Priority
            </option>
          ))}
        </select>
        <TagPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-xs px-2 py-1 rounded-lg border-[1.5px] border-[#e5e7eb]"
        />
        <select
          value={estimateMin ?? ''}
          onChange={(e) =>
            setEstimateMin(e.target.value ? Number(e.target.value) : null)
          }
          className="text-xs px-2 py-1 rounded-lg border-[1.5px] border-[#e5e7eb]"
          title="Estimate"
        >
          <option value="">No estimate</option>
          <option value="15">Est 15m</option>
          <option value="25">Est 25m</option>
          <option value="50">Est 50m</option>
          <option value="60">Est 1h</option>
          <option value="90">Est 1h 30m</option>
          <option value="120">Est 2h</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={reset}
          className="bg-transparent border-0 text-[#aaa] cursor-pointer text-[13px]"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          className="bg-[#8b5cf6] text-white border-0 rounded-lg px-4 py-[6px] text-[13px] font-bold cursor-pointer"
        >
          Create
        </button>
      </div>
    </div>
  );
}
