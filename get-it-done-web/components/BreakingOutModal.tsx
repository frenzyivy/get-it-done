'use client';

import { useEffect, useMemo, useState } from 'react';

// Focus Lock — Screen 3 (web port of BreakingOutModal). Shown when a user
// tries to exit a No Mercy / Strict session before the planned duration
// completes. Forces reason selection and holds the "Leave" button disabled
// for 4 seconds. The write happens in the parent via markSessionBroken(reason).

const REASONS = [
  { emoji: '🤒', label: 'Genuine emergency' },
  { emoji: '🚪', label: 'Need to leave this spot' },
  { emoji: '🙈', label: 'Just got distracted' },
];

interface Props {
  visible: boolean;
  elapsedSeconds: number;
  plannedSeconds: number | null;
  streak: number;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function BreakingOutModal({
  visible,
  elapsedSeconds,
  plannedSeconds,
  streak,
  onCancel,
  onConfirm,
}: Props) {
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [countdown, setCountdown] = useState(4);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPickedIndex(null);
      setCustomReason('');
      setCountdown(4);
      setSubmitting(false);
      return;
    }
    setCountdown(4);
    const id = window.setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [visible]);

  const elapsedMin = Math.floor(elapsedSeconds / 60);
  const plannedMin = plannedSeconds ? Math.round(plannedSeconds / 60) : null;

  const reason = useMemo(() => {
    if (customReason.trim().length > 0) return customReason.trim();
    if (pickedIndex !== null) return REASONS[pickedIndex].label;
    return null;
  }, [customReason, pickedIndex]);

  const canLeave = countdown === 0 && reason !== null && !submitting;

  const handleLeave = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(reason);
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Leave this focus session"
    >
      <div className="w-full max-w-[420px] bg-white rounded-[24px] p-5">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center mb-[14px]"
          style={{ background: '#FDE0EA' }}
        >
          <span className="text-[22px]">⚠️</span>
        </div>
        <h2 className="text-[20px] font-extrabold text-[#1a1a2e] mb-[6px]">
          Leave this session?
        </h2>
        <p className="text-[14px] text-[#555] leading-[20px]">
          {plannedMin !== null
            ? `You're ${elapsedMin}m into a ${plannedMin}m block. `
            : `You're ${elapsedMin}m into this session. `}
          <span className="font-extrabold text-[#E5447A]">
            Leaving marks this as a broken session
          </span>
          {streak > 0 ? ` and ends your ${streak}-day streak.` : '.'}
        </p>

        <div className="text-[11px] font-bold text-[#888] mt-[18px] mb-2 tracking-[0.5px]">
          WHY ARE YOU LEAVING?
        </div>

        {REASONS.map((r, i) => {
          const active = pickedIndex === i;
          return (
            <button
              key={r.label}
              onClick={() => {
                setPickedIndex(i);
                setCustomReason('');
              }}
              role="radio"
              aria-checked={active}
              className="flex items-center gap-[10px] w-full text-left rounded-[12px] px-3 py-[10px] mb-2 border-[2px] transition-colors"
              style={{
                borderColor: active ? '#E5447A' : '#E5E5E5',
                background: active ? '#FFF1F5' : '#fff',
              }}
            >
              <span className="text-[18px]">{r.emoji}</span>
              <span className="text-[14px] font-bold text-[#1a1a2e]">
                {r.label}
              </span>
            </button>
          );
        })}

        <input
          type="text"
          value={customReason}
          onChange={(e) => {
            setCustomReason(e.target.value);
            if (e.target.value.length > 0) setPickedIndex(null);
          }}
          placeholder="Or type your own reason…"
          className="w-full border border-[#E5E5E5] rounded-[10px] px-3 py-[10px] text-[13px] text-[#1a1a2e] mt-1"
        />

        <div className="flex gap-[10px] mt-[18px]">
          <button
            onClick={onCancel}
            className="flex-1 border border-[#CCC] rounded-[12px] py-[14px] text-[13px] font-extrabold text-[#1a1a2e]"
          >
            Stay focused
          </button>
          <button
            onClick={handleLeave}
            disabled={!canLeave}
            aria-live="polite"
            aria-label={countdown > 0 ? `Leave in ${countdown} seconds` : 'Leave now'}
            className="flex-1 rounded-[12px] py-[14px] text-[13px] font-extrabold text-white transition-colors"
            style={{ background: canLeave ? '#E5447A' : '#F5C6D4' }}
          >
            {countdown > 0
              ? `Leave in ${countdown}s…`
              : !reason
                ? 'Pick a reason'
                : submitting
                  ? 'Leaving…'
                  : 'Leave'}
          </button>
        </div>
      </div>
    </div>
  );
}
