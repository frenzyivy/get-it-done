'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import type { CalendarPreset, DailyTargets } from '@/types';

const DAYS = [
  { key: 'mon' as const, label: 'Mon' },
  { key: 'tue' as const, label: 'Tue' },
  { key: 'wed' as const, label: 'Wed' },
  { key: 'thu' as const, label: 'Thu' },
  { key: 'fri' as const, label: 'Fri' },
  { key: 'sat' as const, label: 'Sat' },
  { key: 'sun' as const, label: 'Sun' },
];

const PRESETS: { id: CalendarPreset; label: string; values: Record<string, number> }[] =
  [
    {
      id: 'weekend-off',
      label: 'Weekdays only',
      values: { mon: 16, tue: 16, wed: 16, thu: 16, fri: 16, sat: 0, sun: 0 },
    },
    {
      id: 'balanced',
      label: 'Balanced',
      values: { mon: 16, tue: 16, wed: 18, thu: 16, fri: 14, sat: 12, sun: 8 },
    },
    {
      id: 'hustle',
      label: 'Hustle 7 days',
      values: { mon: 14, tue: 14, wed: 14, thu: 14, fri: 14, sat: 14, sun: 14 },
    },
  ];

interface Props {
  targets: DailyTargets;
}

// Spec § Calendar — black config card above the grid. 7 number inputs Mon-Sun
// + 4 preset buttons. Save-on-blur per Phase 3 step 10 decision (c): inline
// edits commit on blur; preset clicks save immediately.
export function CalendarTargetEditor({ targets }: Props) {
  const updateDailyTargets = useStore((s) => s.updateDailyTargets);

  // Local edit buffer keyed per day. Synced from prop on render via the same
  // "previous prop in state" pattern AddTaskForm uses — set during render
  // when the canonical value changes (e.g., another tab edits the row, or
  // a preset click reflows the inputs).
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(DAYS.map((d) => [d.key, String(targets[d.key])])),
  );
  const [prevTargets, setPrevTargets] = useState<DailyTargets>(targets);
  if (
    targets.user_id === prevTargets.user_id &&
    DAYS.some((d) => targets[d.key] !== prevTargets[d.key])
  ) {
    setPrevTargets(targets);
    setDraft(
      Object.fromEntries(DAYS.map((d) => [d.key, String(targets[d.key])])),
    );
  }

  const total = DAYS.reduce((sum, d) => sum + (targets[d.key] || 0), 0);

  const commitDay = (day: (typeof DAYS)[number]['key']) => {
    const raw = draft[day];
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
      // Roll back to canonical
      setDraft((d) => ({ ...d, [day]: String(targets[day]) }));
      return;
    }
    if (parsed === targets[day]) return;
    void updateDailyTargets({ [day]: parsed, preset_name: 'custom' });
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    void updateDailyTargets({ ...preset.values, preset_name: preset.id });
  };

  return (
    <div
      className="rounded-2xl p-4 mb-4"
      style={{
        background: '#1a1a2e',
        color: '#fff',
        boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
      }}
    >
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-[10px] font-mono uppercase tracking-[1px] text-white/55">
          Daily targets · hours
        </span>
        <span className="ml-auto text-[11px] font-mono text-white/70">
          Weekly total{' '}
          <span className="text-white font-extrabold">{total}h</span>
        </span>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-4">
        {DAYS.map((d) => (
          <label
            key={d.key}
            className="flex flex-col gap-[4px] text-[10px] font-mono uppercase tracking-wider text-white/55"
          >
            {d.label}
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={draft[d.key]}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, [d.key]: e.target.value }))
              }
              onBlur={() => commitDay(d.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setDraft((prev) => ({ ...prev, [d.key]: String(targets[d.key]) }));
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="bg-white/10 border border-white/15 rounded-md px-2 py-[6px] text-[14px] font-extrabold text-white outline-none focus:border-white/40 transition-colors w-full"
            />
          </label>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {PRESETS.map((p) => {
          const active = targets.preset_name === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className="text-[11px] px-3 py-[6px] rounded-full border cursor-pointer font-medium transition-colors"
              style={{
                background: active ? '#fff' : 'transparent',
                color: active ? '#1a1a2e' : 'rgba(255,255,255,0.7)',
                borderColor: active ? '#fff' : 'rgba(255,255,255,0.2)',
              }}
            >
              {p.label}
            </button>
          );
        })}
        <span
          className="text-[11px] px-3 py-[6px] rounded-full border font-mono uppercase tracking-wider"
          style={{
            color:
              targets.preset_name === 'custom' || targets.preset_name == null
                ? '#fff'
                : 'rgba(255,255,255,0.4)',
            borderColor:
              targets.preset_name === 'custom' || targets.preset_name == null
                ? 'rgba(255,255,255,0.4)'
                : 'rgba(255,255,255,0.15)',
            background: 'transparent',
          }}
          aria-hidden
        >
          {targets.preset_name === 'custom' || targets.preset_name == null
            ? 'Custom'
            : 'Custom'}
        </span>
      </div>
    </div>
  );
}
