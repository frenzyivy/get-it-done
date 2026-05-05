// Week-grid date helpers for ScheduleWeekView. Vanilla Date only — the
// codebase intentionally avoids date-fns/dayjs.

export function startOfWeekMonday(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay(); // 0=Sun … 6=Sat
  const offset = (day + 6) % 7; // Mon=0, Sun=6
  out.setDate(out.getDate() - offset);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function sameYMD(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
