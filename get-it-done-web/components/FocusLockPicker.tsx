'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { FOCUS_LOCK_TO_MODE, type FocusLockLevel } from '@/types';

// Focus Lock — Screen 1 (web port of FocusLockPickerSheet). Opens when the
// store's `focusLockPicker` slot is set (FAB long-press, task card play, or
// Settings). Inserts a tracked_sessions row with the chosen mode + planned
// duration, then hands off to FocusModeView via `openFocusMode`.

const LEVELS: {
  id: FocusLockLevel;
  label: string;
  badge?: { text: string; bg: string };
  blurb: string;
}[] = [
  {
    id: 'just_track',
    label: 'Just track',
    blurb: 'Track time. No restrictions.',
  },
  {
    id: 'focus',
    label: 'Focus',
    badge: { text: 'RECOMMENDED', bg: '#6B5BF5' },
    blurb: 'Tab must stay foreground. Drift is logged.',
  },
  {
    id: 'no_mercy',
    label: 'No mercy',
    badge: { text: 'NO MERCY', bg: '#E5447A' },
    blurb: 'Leaving breaks session + streak. Must type a reason.',
  },
];

const DURATIONS: { label: string; minutes: number | null }[] = [
  { label: '25m', minutes: 25 },
  { label: '50m', minutes: 50 },
  { label: '90m', minutes: 90 },
  { label: 'Free', minutes: null },
];

export function FocusLockPicker() {
  const picker = useStore((s) => s.focusLockPicker);
  const tasks = useStore((s) => s.tasks);
  const closeFocusLockPicker = useStore((s) => s.closeFocusLockPicker);
  const startTrackingTask = useStore((s) => s.startTrackingTask);
  const openFocusMode = useStore((s) => s.openFocusMode);

  const [level, setLevel] = useState<FocusLockLevel>('focus');
  const [minutes, setMinutes] = useState<number | null>(50);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (picker) {
      setLevel('focus');
      setMinutes(50);
      setSubmitting(false);
    }
  }, [picker]);

  const task = useMemo(
    () => (picker ? tasks.find((t) => t.id === picker.taskId) ?? null : null),
    [tasks, picker],
  );
  const subtask = useMemo(
    () =>
      task && picker?.subtaskId
        ? task.subtasks.find((s) => s.id === picker.subtaskId) ?? null
        : null,
    [task, picker],
  );

  useEffect(() => {
    if (!picker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFocusLockPicker();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picker, closeFocusLockPicker]);

  if (!picker) return null;

  const handleStart = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const mode = FOCUS_LOCK_TO_MODE[level];
      const planned = minutes === null ? null : minutes * 60;
      const session = await startTrackingTask(
        picker.taskId,
        picker.subtaskId,
        mode,
        planned,
      );
      closeFocusLockPicker();
      if (session) openFocusMode(session.id);
    } finally {
      setSubmitting(false);
    }
  };

  const buttonLabel =
    minutes === null
      ? level === 'just_track'
        ? 'Start tracking'
        : `Start ${levelShort(level)}`
      : `Start ${levelShort(level)} · ${minutes}m`;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={closeFocusLockPicker}
      role="dialog"
      aria-modal="true"
      aria-label="Choose focus lock level"
    >
      <div
        className="w-full max-w-[520px] bg-white rounded-t-[28px] px-5 pt-[14px] pb-7 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-[#E5E5E5] rounded-[2px] mx-auto mb-4" />

        <h2 className="text-[20px] font-extrabold text-[#1a1a2e] mb-1">
          Start timer
        </h2>
        {task && (
          <div className="mt-[10px] bg-[#F6F3F9] rounded-[12px] p-3">
            <div className="text-[11px] font-bold text-[#888] tracking-[0.5px]">
              TRACKING
            </div>
            <div className="text-[14px] font-bold text-[#1a1a2e] mt-1 line-clamp-2">
              {task.title}
              {subtask ? ` → ${subtask.title}` : ''}
            </div>
          </div>
        )}

        <div className="text-[11px] font-bold text-[#888] mt-[18px] mb-[10px] tracking-[0.5px]">
          HOW FOCUSED?
        </div>

        {LEVELS.map((lvl) => {
          const active = level === lvl.id;
          return (
            <button
              key={lvl.id}
              onClick={() => setLevel(lvl.id)}
              role="radio"
              aria-checked={active}
              className="block w-full text-left rounded-[14px] p-[14px] mb-[10px] border-[2px] transition-colors"
              style={{
                borderColor: active ? '#8b5cf6' : '#E5E5E5',
                background: active ? '#F5F2FF' : '#fff',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-extrabold text-[#1a1a2e]">
                  {lvl.label}
                </span>
                {lvl.badge && (
                  <span
                    className="text-white text-[9px] font-extrabold tracking-[0.5px] px-2 py-[2px] rounded-[4px]"
                    style={{ background: lvl.badge.bg }}
                  >
                    {lvl.badge.text}
                  </span>
                )}
              </div>
              <div className="text-[12px] text-[#666] mt-1">{lvl.blurb}</div>
            </button>
          );
        })}

        <div className="text-[11px] font-bold text-[#888] mt-2 mb-[10px] tracking-[0.5px]">
          DURATION
        </div>

        <div className="flex gap-2">
          {DURATIONS.map((d) => {
            const active = minutes === d.minutes;
            return (
              <button
                key={d.label}
                onClick={() => setMinutes(d.minutes)}
                className="flex-1 border-[2px] rounded-[10px] py-[10px] text-[14px] font-bold transition-colors"
                style={{
                  borderColor: active ? '#8b5cf6' : '#E5E5E5',
                  background: active ? '#F5F2FF' : '#fff',
                  color: active ? '#8b5cf6' : '#1a1a2e',
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleStart}
          disabled={!picker.taskId || submitting}
          className="block w-full mt-[22px] rounded-[14px] py-4 text-[15px] font-extrabold text-white disabled:opacity-50"
          style={{ background: '#8b5cf6' }}
        >
          {submitting ? 'Starting…' : buttonLabel}
        </button>
      </div>
    </div>
  );
}

function levelShort(level: FocusLockLevel): string {
  switch (level) {
    case 'just_track':
      return 'tracking';
    case 'focus':
      return 'focus';
    case 'no_mercy':
      return 'no-mercy';
  }
}
