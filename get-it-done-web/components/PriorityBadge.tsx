import { PRIORITIES } from '@/lib/constants';
import type { Priority } from '@/types';

export function PriorityBadge({ priority }: { priority: Priority }) {
  const p = PRIORITIES.find((x) => x.value === priority) ?? PRIORITIES[0];
  return (
    <span
      className="text-[11px] font-bold uppercase tracking-[0.5px] rounded-md px-2 py-[2px]"
      style={{ background: p.bg, color: p.color }}
    >
      {p.label}
    </span>
  );
}
