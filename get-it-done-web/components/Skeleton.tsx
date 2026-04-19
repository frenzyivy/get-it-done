export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-[14px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="h-4 w-3/5 rounded bg-[#eef0f4]" />
      <div className="mt-3 flex gap-2">
        <div className="h-5 w-14 rounded-full bg-[#eef0f4]" />
        <div className="h-5 w-16 rounded-full bg-[#eef0f4]" />
      </div>
      <div className="mt-3 h-2 w-full rounded bg-[#eef0f4]" />
    </div>
  );
}

export function SkeletonBoard() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {[0, 1, 2].map((col) => (
        <div key={col} className="rounded-2xl bg-[rgba(0,0,0,0.02)] p-[14px]">
          <div className="mb-[14px] h-4 w-24 animate-pulse rounded bg-[#eef0f4]" />
          <div className="flex flex-col gap-[10px]">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      ))}
    </div>
  );
}
