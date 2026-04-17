interface Props {
  value: number;
  height?: number;
  accent?: string;
}

export function ProgressBar({ value, height = 6, accent }: Props) {
  const fill =
    accent ?? (value === 100 ? '#10b981' : value > 50 ? '#f59e0b' : '#8b5cf6');
  return (
    <div
      className="w-full overflow-hidden bg-black/[.06]"
      style={{ height, borderRadius: height }}
    >
      <div
        className="h-full transition-[width] duration-[400ms] ease-[cubic-bezier(.4,0,.2,1)]"
        style={{ width: `${value}%`, borderRadius: height, background: fill }}
      />
    </div>
  );
}
