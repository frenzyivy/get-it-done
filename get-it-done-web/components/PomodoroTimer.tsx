'use client';

import { useEffect, useRef, useState } from 'react';
import { fmt, fmtShort } from '@/lib/utils';
import { useStore } from '@/lib/store';
import type { TaskType } from '@/types';

const GENERAL = '__general__';

interface Props {
  task: TaskType;
  expanded: boolean;
  onToggle: () => void;
}

export function PomodoroTimer({ task, expanded, onToggle }: Props) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeSubtaskId, setActiveSubtaskId] = useState<string>(GENERAL);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<string | null>(null);
  const saveTimeSession = useStore((s) => s.saveTimeSession);

  useEffect(() => {
    if (running) {
      startTimeRef.current ??= new Date().toISOString();
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const activeSub = task.subtasks.find((s) => s.id === activeSubtaskId);
  const activeLabel = activeSub ? activeSub.title : 'General (whole task)';

  const handleStart = () => {
    setElapsed(0);
    startTimeRef.current = new Date().toISOString();
    setRunning(true);
  };
  const handlePause = () => setRunning(false);
  const handleResume = () => setRunning(true);
  const handleDiscard = () => {
    setRunning(false);
    setElapsed(0);
    startTimeRef.current = null;
  };

  const handleStop = async () => {
    setRunning(false);
    if (elapsed <= 0) return;
    const startedAt = startTimeRef.current ?? new Date().toISOString();
    const subId = activeSubtaskId === GENERAL ? null : activeSubtaskId;
    await saveTimeSession(task.id, subId, startedAt, elapsed, activeLabel);
    setElapsed(0);
    startTimeRef.current = null;
  };

  const totalTime = task.total_time_seconds + (running ? elapsed : 0);
  const sessionCount = task.sessions.length + (running ? 1 : 0);

  const timerIcon = (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={totalTime > 0 ? `${fmtShort(totalTime)} tracked` : 'Start timer'}
      className="relative w-8 h-8 rounded-lg border-0 shrink-0 flex items-center justify-center cursor-pointer transition-all"
      style={{
        background: running
          ? '#8b5cf6'
          : totalTime > 0
            ? 'rgba(139,92,246,0.1)'
            : 'rgba(0,0,0,0.04)',
      }}
    >
      {running ? (
        <span className="text-[13px] leading-none text-white">⏸</span>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={totalTime > 0 ? '#8b5cf6' : '#999'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )}
      {running && (
        <span className="absolute -top-[3px] -right-[3px] w-2 h-2 rounded-full bg-[#ef4444] animate-[pomoPulse_1s_ease-in-out_infinite]" />
      )}
    </button>
  );

  if (!expanded) return { timerIcon, panel: null, running, totalTime };

  const Btn = ({
    onClick,
    bg,
    color,
    children,
  }: {
    onClick: () => void;
    bg: string;
    color?: string;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      className="rounded-[10px] px-4 py-2 text-[13px] font-bold cursor-pointer border-0"
      style={{ background: bg, color: color ?? '#fff' }}
    >
      {children}
    </button>
  );

  const panel = (
    <div
      className="rounded-xl p-[14px] mt-2 border-[1.5px] border-[rgba(139,92,246,0.15)]"
      style={{ background: 'linear-gradient(135deg, #f8f7ff, #f0f0ff)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3">
        <div className="text-[11px] font-bold text-[#888] uppercase tracking-[0.5px] mb-1">
          Working on
        </div>
        <select
          value={activeSubtaskId}
          onChange={(e) => setActiveSubtaskId(e.target.value)}
          disabled={running}
          className="w-full px-[10px] py-2 rounded-[10px] text-[13px] font-semibold outline-none"
          style={{
            border: running ? '1.5px solid rgba(139,92,246,0.3)' : '1.5px solid #e5e7eb',
            background: running ? 'rgba(139,92,246,0.05)' : '#fff',
            color: running ? '#8b5cf6' : '#1a1a2e',
            cursor: running ? 'not-allowed' : 'pointer',
          }}
        >
          <option value={GENERAL}>🎯 General (whole task)</option>
          {task.subtasks.map((s) => (
            <option key={s.id} value={s.id}>
              {s.is_done ? '✅' : '○'} {s.title}
              {s.total_time_seconds > 0 ? ` (${fmtShort(s.total_time_seconds)})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-center gap-3 mb-1">
        <div
          className="text-[36px] font-extrabold tabular-nums tracking-[1px] transition-all"
          style={{
            color: running ? '#8b5cf6' : '#1a1a2e',
            textShadow: running ? '0 0 20px rgba(139,92,246,0.3)' : 'none',
          }}
        >
          {fmt(elapsed)}
        </div>
      </div>
      {running && (
        <div className="text-center text-xs text-[#8b5cf6] font-semibold mb-2">
          ▸ {activeLabel}
        </div>
      )}

      <div className="flex gap-2 justify-center mb-3">
        {!running && elapsed === 0 && (
          <Btn onClick={handleStart} bg="#8b5cf6">
            ▶ Start
          </Btn>
        )}
        {running && (
          <>
            <Btn onClick={handlePause} bg="#f59e0b">
              ⏸ Pause
            </Btn>
            <Btn onClick={handleStop} bg="#10b981">
              ⏹ Save
            </Btn>
          </>
        )}
        {!running && elapsed > 0 && (
          <>
            <Btn onClick={handleResume} bg="#8b5cf6">
              ▶ Resume
            </Btn>
            <Btn onClick={handleStop} bg="#10b981">
              ⏹ Save
            </Btn>
            <Btn onClick={handleDiscard} bg="rgba(0,0,0,0.06)" color="#888">
              ✕ Discard
            </Btn>
          </>
        )}
      </div>

      <div className="flex gap-4 justify-center py-2 border-t border-[rgba(139,92,246,0.1)]">
        <div className="text-center">
          <div className="text-[18px] font-extrabold text-[#8b5cf6]">
            {fmtShort(totalTime)}
          </div>
          <div className="text-[10px] text-[#888] font-semibold uppercase tracking-[0.5px]">
            Total
          </div>
        </div>
        <div className="text-center">
          <div className="text-[18px] font-extrabold text-[#1a1a2e]">{sessionCount}</div>
          <div className="text-[10px] text-[#888] font-semibold uppercase tracking-[0.5px]">
            Sessions
          </div>
        </div>
      </div>

      {task.sessions.length > 0 && (
        <div className="mt-2">
          <div className="text-[11px] font-bold text-[#aaa] uppercase tracking-[0.5px] mb-1">
            Session Log
          </div>
          <div className="max-h-[150px] overflow-y-auto">
            {[...task.sessions]
              .sort(
                (a, b) =>
                  new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
              )
              .map((s) => {
                const d = new Date(s.started_at);
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 py-[5px] border-b border-black/[.04] text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[#1a1a2e] whitespace-nowrap overflow-hidden text-ellipsis">
                        {s.label || 'General'}
                      </div>
                      <div className="text-[#aaa] text-[11px]">
                        {d.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        ·{' '}
                        {d.toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <span className="font-bold text-[#8b5cf6] whitespace-nowrap">
                      {fmtShort(s.duration_seconds)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );

  return { timerIcon, panel, running, totalTime };
}
