'use client';

// Spec § Change #6 — small stat card for the Daily Progress tab. Generic so
// the same component renders Today / This week / 30-day average. Delta is
// optional (used by This week vs last week).

interface Props {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: { value: number; positive: boolean } | null;
}

export function DailyProgressStat({ label, value, sub, delta }: Props) {
  return (
    <div
      className="rounded-[14px] p-4"
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
      }}
    >
      <div className="text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af]">
        {label}
      </div>
      <div className="text-[24px] font-extrabold text-[#1a1a2e] mt-[2px] tabular-nums">
        {value}
      </div>
      {(sub || delta) && (
        <div className="text-[11px] text-[#888] mt-[2px] flex items-center gap-2">
          {sub}
          {delta && (
            <span
              className="font-semibold"
              style={{ color: delta.positive ? '#10b981' : '#dc2626' }}
            >
              {delta.positive ? '↑' : '↓'} {Math.abs(delta.value)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
