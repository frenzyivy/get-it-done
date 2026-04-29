'use client';

// Spec § Change #6 — circular SVG, 56px, white-on-black, partial arc to next
// milestone (5d, 10d, etc.). Center number bold; subtitle below the ring is
// rendered by the caller so this component stays purely visual.
const SIZE = 56;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

// Next milestone is the smallest of {5, 10, 25, 50, 100, 250, 500, 1000} that
// is greater than `current`. If `current` already exceeds the largest, treat
// the next milestone as +100 days.
function nextMilestone(current: number): number {
  const ms = [5, 10, 25, 50, 100, 250, 500, 1000];
  for (const m of ms) {
    if (m > current) return m;
  }
  return current + 100;
}

interface Props {
  current: number;
}

export function StreakRing({ current }: Props) {
  const target = nextMilestone(current);
  const ratio = target > 0 ? Math.min(1, current / target) : 0;
  const dashOffset = C * (1 - ratio);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="#1a1a2e"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke="#fff"
        strokeWidth={STROKE}
        strokeDasharray={C}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
      />
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 5}
        textAnchor="middle"
        fontSize={18}
        fontWeight={800}
        fill="#fff"
      >
        {current}
      </text>
    </svg>
  );
}
