'use client';

import { useState } from 'react';
import { fmtShort } from '@/lib/utils';
import { useStore } from '@/lib/store';
import type { SubtaskType } from '@/types';

interface Props {
  subtask: SubtaskType;
  taskId: string;
  taskTitle: string;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

// Feature 2a — every subtask row has its own play/timer button. Clicking it
// starts the global tracker with both task_id and subtask_id set, so time is
// attributed to the specific subtask.
export function SubtaskItem({
  subtask,
  taskId,
  taskTitle,
  onToggle,
  onDelete,
  onRename,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(subtask.title);
  const activeSessions = useStore((s) => s.activeSessions);
  const startTrackingTask = useStore((s) => s.startTrackingTask);
  const stopSession = useStore((s) => s.stopSession);
  const openFocusMode = useStore((s) => s.openFocusMode);
  const prefs = useStore((s) => s.prefs);

  const runningForThisSubtask = activeSessions.find(
    (s) => s.subtask_id === subtask.id,
  );
  const isTrackingThis = !!runningForThisSubtask;

  // Silence unused-var warnings from the prop — keeps the call-site signature
  // stable while the "start a concurrent timer" interaction no longer needs
  // the task title for a confirm() prompt.
  void taskTitle;

  const commit = () => {
    const next = val.trim();
    if (next && next !== subtask.title) onRename(next);
    setEditing(false);
  };

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTrackingThis && runningForThisSubtask) {
      return void stopSession(runningForThisSubtask.id);
    }
    const defaultMode = prefs?.default_timer_mode ?? 'open';
    const session = await startTrackingTask(taskId, subtask.id, defaultMode);
    if (session && defaultMode !== 'open') openFocusMode(session.id);
  };

  return (
    <>
      <style>{`
        @keyframes subtaskLivePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
      <div className="flex items-center gap-2 py-[5px] border-b border-black/[.04]">
      {/* Spec § Task time displays — pulsing dot prefix when this subtask is
          the active timer, matching the NowTrackingBar visual. */}
      {isTrackingThis && (
        <span
          className="w-[6px] h-[6px] rounded-full bg-[#1a1a2e] shrink-0"
          style={{ animation: 'subtaskLivePulse 1.4s ease-in-out infinite' }}
          aria-hidden
        />
      )}
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
          className="flex-1 border-0 border-b-[1.5px] border-[#1a1a2e] outline-none text-[13px] py-[2px] bg-transparent"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          onDoubleClick={() => setEditing(true)}
          title="Click to rename"
          className={`flex-1 text-[13px] cursor-text transition-colors ${
            subtask.is_done ? 'line-through text-[#aaa]' : 'text-[#333]'
          }`}
        >
          {subtask.title}
        </span>
      )}
      {/* Spec § Task time displays — clean monospace number, no pill.
          Sums legacy total_time_seconds + tracked_sessions rollup so live-timer
          time shows up alongside the old Pomodoro RPC time. */}
      {subtask.total_time_seconds + subtask.tracked_total_seconds > 0 && (
        <span className="text-[11px] font-mono tabular-nums text-[#666] whitespace-nowrap shrink-0">
          {fmtShort(subtask.total_time_seconds + subtask.tracked_total_seconds)}
        </span>
      )}
      <button
        onClick={handlePlay}
        className="w-[22px] h-[22px] rounded-full border-0 cursor-pointer flex items-center justify-center text-[11px] font-bold shrink-0"
        style={{
          background: isTrackingThis ? '#1a1a2e' : 'rgba(0,0,0,0.1)',
          color: isTrackingThis ? '#fff' : '#1a1a2e',
        }}
        title={isTrackingThis ? 'Stop timer' : 'Track this subtask'}
        aria-label={isTrackingThis ? 'Stop timer' : 'Track this subtask'}
      >
        {isTrackingThis ? '⏸' : '▶'}
      </button>
      <button
        onClick={onDelete}
        className="bg-transparent border-0 text-[#ccc] cursor-pointer text-sm p-0 leading-none hover:text-[#dc2626]"
        title="Remove"
      >
        ×
      </button>
      </div>
    </>
  );
}
