import type { TagType } from '@/types';

export function TagBadge({ tag }: { tag: TagType | undefined }) {
  if (!tag) return null;
  return (
    <span
      className="text-[11px] font-semibold px-2 py-[2px] rounded-md whitespace-nowrap tracking-[0.3px]"
      style={{ background: tag.color + '18', color: tag.color }}
    >
      {tag.name}
    </span>
  );
}
