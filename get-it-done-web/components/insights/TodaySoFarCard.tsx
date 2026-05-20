'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { fmtShort } from '@/lib/utils';

// Spec § Change #6 — slim list of today's tasks with check / missed status,
// category dot, time tracked. Day picker on the right (Today / Yesterday /
// Pick a day).

type DayChoice = 'today' | 'yesterday' | 'custom';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function TodaySoFarCard() {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);

  const [choice, setChoice] = useState<DayChoice>('today');
  const [customDate, setCustomDate] = useState<string>(() => ymd(new Date()));

  const targetDate = (() => {
    if (choice === 'today') return ymd(new Date());
    if (choice === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return ymd(d);
    }
    return customDate;
  })();

  const dayTasks = tasks
    .filter((t) => t.planned_for_date === targetDate)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div
      className="rounded-[14px] p-[18px] mt-4"
      style={{ background: '#fff', border: '1px solid #e5e7eb' }}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="text-[15px] font-bold text-[#1a1a2e]">Today so far</div>
        <div className="ml-auto inline-flex rounded-[10px] p-[3px] bg-[#f3f4f6] border border-[#e5e7eb]">
          {(['today', 'yesterday', 'custom'] as DayChoice[]).map((c) => (
            <button
              key={c}
              onClick={() => setChoice(c)}
              className="px-[10px] py-[4px] text-[11px] font-medium rounded-[7px] cursor-pointer border-0"
              style={{
                background: choice === c ? '#1a1a2e' : 'transparent',
                color: choice === c ? '#fff' : '#5b5674',
              }}
            >
              {c === 'today' ? 'Today' : c === 'yesterday' ? 'Yesterday' : 'Pick a day'}
            </button>
          ))}
        </div>
        {choice === 'custom' && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="text-xs px-2 py-1 rounded-lg border-[1.5px] border-[#e5e7eb]"
          />
        )}
      </div>

      {dayTasks.length === 0 ? (
        <div className="text-[12px] text-[#9ca3af] py-4 text-center">
          No tasks planned for {targetDate}.
        </div>
      ) : (
        <div className="flex flex-col">
          {dayTasks.map((t) => {
            const isDone = t.effective_status === 'done';
            const cat = categories.find((c) => c.id === t.category_ids[0]);
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 py-[8px] border-b border-[#f3f4f6] last:border-b-0"
              >
                <span
                  className="w-[16px] h-[16px] rounded flex items-center justify-center text-white text-[10px] shrink-0"
                  style={{
                    border: isDone ? 'none' : '2px solid #ddd',
                    background: isDone ? '#10b981' : 'transparent',
                  }}
                  aria-label={isDone ? 'Done' : 'Not done'}
                >
                  {isDone ? '✓' : ''}
                </span>
                {cat ? (
                  <span
                    className="w-[8px] h-[8px] rounded-full shrink-0"
                    style={{ background: cat.color }}
                    title={cat.name}
                  />
                ) : (
                  <span className="w-[8px] h-[8px] rounded-full bg-[#e5e7eb] shrink-0" />
                )}
                <span
                  className="flex-1 text-[13px] truncate"
                  style={{
                    color: isDone ? '#888' : '#1a1a2e',
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}
                >
                  {t.title}
                </span>
                <span className="text-[12px] font-mono tabular-nums text-[#888]">
                  {fmtShort(t.total_time_seconds + t.tracked_total_seconds)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
