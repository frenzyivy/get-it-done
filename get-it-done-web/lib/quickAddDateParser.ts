// Hand-rolled date parser for the Quick-add command bar (Phase 5 step 15).
// Supports the spec's listed forms only:
//   today / tomorrow
//   mon / tue / ... / sun (next occurrence)
//   apr 30 / jan 7 / ...  (next occurrence in current or next year)
//   in N days / in N weeks
// Returns YYYY-MM-DD in local time, or null if the token doesn't match.

const WEEKDAY_TO_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const MONTH_TO_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Returns { date, raw } for the FIRST natural-language date phrase found in
// `text`, or null if none. `raw` is the matched substring so the caller can
// strip it from the title.
export function findDateInText(
  text: string,
  now: Date = new Date(),
): { date: string; raw: string } | null {
  const lower = text.toLowerCase();

  // today / tomorrow — exact word
  const todayMatch = /\btoday\b/.exec(lower);
  if (todayMatch) {
    return { date: ymd(now), raw: text.slice(todayMatch.index, todayMatch.index + 5) };
  }
  const tomorrowMatch = /\btomorrow\b/.exec(lower);
  if (tomorrowMatch) {
    const d = new Date(now);
    d.setDate(now.getDate() + 1);
    return {
      date: ymd(d),
      raw: text.slice(tomorrowMatch.index, tomorrowMatch.index + 8),
    };
  }

  // in N days / in N weeks
  const inMatch = /\bin\s+(\d+)\s+(day|days|week|weeks)\b/.exec(lower);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const unit = inMatch[2].startsWith('week') ? 7 : 1;
    const d = new Date(now);
    d.setDate(now.getDate() + n * unit);
    return {
      date: ymd(d),
      raw: text.slice(inMatch.index, inMatch.index + inMatch[0].length),
    };
  }

  // apr 30 / april 30 — month name + day-of-month
  const monthMatch = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s+(\d{1,2})\b/.exec(
    lower,
  );
  if (monthMatch) {
    const monthIdx = MONTH_TO_INDEX[monthMatch[1]];
    const dayN = parseInt(monthMatch[2], 10);
    if (monthIdx !== undefined && dayN >= 1 && dayN <= 31) {
      const candidate = new Date(now.getFullYear(), monthIdx, dayN);
      // If the date is in the past, roll forward one year.
      if (candidate.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
        candidate.setFullYear(now.getFullYear() + 1);
      }
      return {
        date: ymd(candidate),
        raw: text.slice(monthMatch.index, monthMatch.index + monthMatch[0].length),
      };
    }
  }

  // mon / tue / ... — next occurrence (today counts only if "today" matched
  // earlier, which it didn't, so a weekday match always means strictly future).
  const wdMatch = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/.exec(
    lower,
  );
  if (wdMatch) {
    const target = WEEKDAY_TO_INDEX[wdMatch[1]];
    if (target !== undefined) {
      const todayIdx = now.getDay();
      // Always at least 1 day forward (so "monday" on Monday means next Monday).
      const delta = ((target - todayIdx + 7) % 7) || 7;
      const d = new Date(now);
      d.setDate(now.getDate() + delta);
      return {
        date: ymd(d),
        raw: text.slice(wdMatch.index, wdMatch.index + wdMatch[0].length),
      };
    }
  }

  return null;
}
