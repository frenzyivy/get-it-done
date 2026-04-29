'use client';

// Spec § Calendar — single day cell with one of 6 ring states. Ring math from
// the spec: r=44 in a 100x100 viewBox (8% inset), c = 2πr ≈ 276.46.

const R = 44;
const C = 2 * Math.PI * R;

export type RingState =
  | 'no_data'
  | 'rest_day'
  | 'partial'
  | 'goal_hit'
  | 'exceeded'
  | 'rest_bonus';

export function ringState(
  secondsLogged: number,
  targetHours: number,
): RingState {
  const hours = secondsLogged / 3600;
  if (targetHours === 0 && hours === 0) return 'rest_day';
  if (targetHours === 0 && hours > 0) return 'rest_bonus';
  if (hours === 0) return 'no_data';
  if (hours > targetHours) return 'exceeded';
  if (hours >= targetHours) return 'goal_hit';
  return 'partial';
}

interface Props {
  // YYYY-MM-DD label is what we display; full Date is needed for the dim-
  // outside-month rendering and the today highlight.
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  secondsLogged: number;
  targetHours: number;
}

export function CalendarDay({
  date,
  inMonth,
  isToday,
  secondsLogged,
  targetHours,
}: Props) {
  const state = ringState(secondsLogged, targetHours);
  const hours = secondsLogged / 3600;

  // Visual ratio caps at 1 — exceed shows via stroke + glow, not a longer arc.
  const visualRatio =
    targetHours > 0 ? Math.min(1, hours / targetHours) : hours > 0 ? 1 : 0;
  const dashOffset = C * (1 - visualRatio);

  const showRing =
    state === 'partial' ||
    state === 'goal_hit' ||
    state === 'exceeded' ||
    state === 'rest_bonus';

  const strokeWidth = state === 'exceeded' ? 5 : 3;
  // Filter URL is unique per day so multiple "exceeded" cells can co-render
  // without CSS-id collisions in the same SVG namespace.
  const glowId = `glow-${date.toISOString().slice(0, 10)}`;

  const dim = !inMonth || state === 'rest_day';

  const tooltip =
    state === 'rest_day'
      ? 'Rest day'
      : state === 'rest_bonus'
        ? `Bonus — ${hours.toFixed(1)}h on a rest day`
        : state === 'no_data'
          ? `No work · target ${targetHours}h`
          : `${hours.toFixed(1)}h of ${targetHours}h`;

  return (
    <div
      className="relative aspect-square flex items-center justify-center select-none"
      title={tooltip}
      style={{ opacity: dim ? 0.45 : 1 }}
    >
      {showRing && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          style={{
            filter:
              state === 'exceeded' || state === 'rest_bonus'
                ? `drop-shadow(0 0 6px rgba(255,255,255,0.8))`
                : undefined,
          }}
        >
          {/* Track (faint backdrop ring) — only for partial / goal_hit /
              exceeded states. Rest_bonus draws just the full glowing ring. */}
          {state !== 'rest_bonus' && (
            <circle
              cx={50}
              cy={50}
              r={R}
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={2}
            />
          )}
          {/* Active arc */}
          <circle
            cx={50}
            cy={50}
            r={R}
            fill="none"
            stroke="#fff"
            strokeWidth={strokeWidth}
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            filter={
              state === 'exceeded' || state === 'rest_bonus'
                ? `url(#${glowId})`
                : undefined
            }
          />
        </svg>
      )}
      <span
        className={`relative z-[1] font-mono text-[12px] ${isToday ? 'font-extrabold' : 'font-bold'}`}
        style={{
          color: '#fff',
          textShadow: showRing ? '0 0 4px rgba(0,0,0,0.6)' : undefined,
        }}
      >
        {date.getDate()}
      </span>
      {isToday && (
        <span
          className="absolute bottom-[14%] w-[6px] h-[6px] rounded-full bg-white"
          aria-hidden
        />
      )}
    </div>
  );
}
