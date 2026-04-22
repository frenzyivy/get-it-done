import { labelTintBg } from '@/lib/utils';
import type { CategoryType } from '@/types';

interface Props {
  category: CategoryType | undefined;
}

export function CategoryPill({ category }: Props) {
  if (!category) return null;
  return (
    <span
      className="inline-flex items-center gap-[5px] px-[9px] py-[3px] rounded-md text-[11px] font-bold"
      style={{
        backgroundColor: labelTintBg(category.color),
        color: category.color,
      }}
    >
      <span
        className="block w-[6px] h-[6px] rounded-full"
        style={{ backgroundColor: category.color }}
      />
      {category.name}
    </span>
  );
}
