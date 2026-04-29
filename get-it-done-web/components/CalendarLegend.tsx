'use client';

// Spec § Calendar — legend below the grid. 6 ring states, in plain language.
// Renders as small chips. Light card on the page background, NOT inside the
// dark calendar card.
export function CalendarLegend() {
  return (
    <div className="flex gap-3 flex-wrap items-center mt-4">
      <span className="text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af]">
        Legend
      </span>
      <Item swatch={<DotPlain />} label="No data" />
      <Item swatch={<DotDim />} label="Rest day" />
      <Item swatch={<RingPartial />} label="Partial" />
      <Item swatch={<RingFull stroke={3} />} label="Goal hit" />
      <Item swatch={<RingFull stroke={5} glow />} label="Exceeded" />
      <Item swatch={<RingFull stroke={3} glow />} label="Rest bonus" />
    </div>
  );
}

function Item({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-[6px] text-[11px] text-[#666]">
      {swatch}
      {label}
    </span>
  );
}

function DotPlain() {
  return <span className="w-3 h-3 rounded-full border border-[#ccc] bg-white" />;
}
function DotDim() {
  return (
    <span className="w-3 h-3 rounded-full bg-[#1a1a2e]" style={{ opacity: 0.45 }} />
  );
}
function RingPartial() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4">
      <circle cx={10} cy={10} r={7} fill="#1a1a2e" />
      <circle cx={10} cy={10} r={7} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
      <circle
        cx={10}
        cy={10}
        r={7}
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeDasharray={2 * Math.PI * 7}
        strokeDashoffset={2 * Math.PI * 7 * 0.5}
        strokeLinecap="round"
        transform="rotate(-90 10 10)"
      />
    </svg>
  );
}
function RingFull({ stroke, glow }: { stroke: number; glow?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="w-4 h-4"
      style={{
        filter: glow ? 'drop-shadow(0 0 2px rgba(0,0,0,0.6))' : undefined,
      }}
    >
      <circle cx={10} cy={10} r={7} fill="#1a1a2e" />
      <circle
        cx={10}
        cy={10}
        r={7}
        fill="none"
        stroke="#fff"
        strokeWidth={stroke}
      />
    </svg>
  );
}
