import 'server-only';
import {
  requireUser,
  withCors,
  preflight,
  serverError,
} from '../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

// GET /api/insights/streak-history
//
// Returns last `WINDOW_DAYS` days of streak length, one value per day, in the
// user's timezone. Replays the same rule the live `update_focus_streak`
// trigger uses (migration 0012):
//
//   A day is a "qualifying day" if at least one tracked_session
//   - mode IN ('app_focus', 'strict')
//   - duration_seconds >= 900   (15 min)
//   - broken = false
//   - was_paused = false
//   - ended_at on that day in the user's timezone
//
// Streak length on day N = streak length on (N-1) + 1 if N qualifies and N-1
// qualifies; 1 if N qualifies and N-1 does not; 0 if N does not qualify.
// (Same rule as the trigger: same-day = unchanged, +1 day gap = +1, larger
// gap = reset to 1 on the next qualifying day.)
//
// We seed the streak by walking backwards from `WINDOW_DAYS` ago to the
// earliest qualifying session before the window, so the first values inside
// the window already reflect any pre-window streak. This avoids the chart
// starting at 0 just because the window doesn't include the original streak
// kickoff day.

const WINDOW_DAYS = 84; // 12 weeks
const QUALIFY_SECONDS = 900;

interface SessionRow {
  ended_at: string | null;
  duration_seconds: number | null;
  mode: string | null;
  broken: boolean | null;
  was_paused: boolean | null;
}

export async function GET() {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const { data: prefs, error: prefErr } = await supa
    .from('user_preferences')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();
  if (prefErr) return withCors(serverError(prefErr.message));
  const timezone = prefs?.timezone || 'UTC';

  // Pull every qualifying session for this user. Even at multi-year scale this
  // is bounded by user activity (a session per day-ish for a heavy user). We
  // need everything to find the earliest qualifying day → seed the streak.
  const { data: sessions, error: sessErr } = await supa
    .from('tracked_sessions')
    .select('ended_at, duration_seconds, mode, broken, was_paused')
    .eq('user_id', user.id)
    .in('mode', ['app_focus', 'strict'])
    .gte('duration_seconds', QUALIFY_SECONDS)
    .eq('broken', false)
    .eq('was_paused', false)
    .not('ended_at', 'is', null);
  if (sessErr) return withCors(serverError(sessErr.message));

  // Bucket qualifying ended_at values by user-tz date string (YYYY-MM-DD).
  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const qualifyingDays = new Set<string>();
  for (const row of (sessions ?? []) as SessionRow[]) {
    if (!row.ended_at) continue;
    const ms = new Date(row.ended_at).getTime();
    if (!Number.isFinite(ms)) continue;
    qualifyingDays.add(dayFmt.format(new Date(ms)));
  }

  // Compute the user-tz "today" so the window ends inclusive of today.
  const todayKey = dayFmt.format(new Date());

  // Build the list of YYYY-MM-DD strings for the window, ending on today.
  // Stepping by 24h in UTC won't always land on the next user-tz date for
  // half-hour-offset zones, so derive it via Date arithmetic on the user-tz
  // year/month/day values directly.
  function ymdToParts(s: string): { y: number; m: number; d: number } {
    const [y, m, d] = s.split('-').map((p) => Number.parseInt(p, 10));
    return { y, m, d };
  }
  function partsToYmd(y: number, m: number, d: number): string {
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }
  function addDays(s: string, n: number): string {
    const { y, m, d } = ymdToParts(s);
    // Use UTC math on a sentinel date constructed from y/m/d; safe because we
    // only round-trip y/m/d, not actual instants.
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return partsToYmd(
      dt.getUTCFullYear(),
      dt.getUTCMonth() + 1,
      dt.getUTCDate(),
    );
  }

  const windowStart = addDays(todayKey, -(WINDOW_DAYS - 1));

  // Seed: walk forward from the earliest qualifying day OR from windowStart
  // (whichever is earlier) up to the day before windowStart, computing the
  // streak length so by windowStart the running streak already reflects
  // pre-window activity.
  let earliestQualifying: string | null = null;
  for (const day of qualifyingDays) {
    if (earliestQualifying === null || day < earliestQualifying) {
      earliestQualifying = day;
    }
  }

  let runningStreak = 0;
  let prevDay: string | null = null;

  if (earliestQualifying && earliestQualifying < windowStart) {
    // Walk earliestQualifying → day before windowStart.
    let cursor = earliestQualifying;
    const stopBefore = windowStart;
    while (cursor < stopBefore) {
      if (qualifyingDays.has(cursor)) {
        if (prevDay && addDays(prevDay, 1) === cursor) {
          runningStreak += 1;
        } else {
          runningStreak = 1;
        }
        prevDay = cursor;
      }
      // Note: gap days don't zero the streak in the trigger model — the next
      // qualifying day after a gap *resets* to 1 (handled in the else above).
      cursor = addDays(cursor, 1);
    }
  }

  // Now walk the window day by day, recording streak length per day.
  // streak[i] semantics:
  //   - if day i qualifies: the streak length AT END OF day i
  //   - if day i does not qualify: 0 (rendered as a gap on the chart)
  const days: { date: string; streak: number; qualified: boolean }[] = [];
  let cursor = windowStart;
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const qualified = qualifyingDays.has(cursor);
    if (qualified) {
      if (prevDay && addDays(prevDay, 1) === cursor) {
        runningStreak += 1;
      } else {
        runningStreak = 1;
      }
      prevDay = cursor;
      days.push({ date: cursor, streak: runningStreak, qualified: true });
    } else {
      days.push({ date: cursor, streak: 0, qualified: false });
    }
    cursor = addDays(cursor, 1);
  }

  // Peak: highest streak value AND its date (last occurrence wins on ties so
  // the callout sits on the most recent peak).
  let peakValue = 0;
  let peakDate: string | null = null;
  for (const d of days) {
    if (d.streak >= peakValue && d.streak > 0) {
      peakValue = d.streak;
      peakDate = d.date;
    }
  }

  return withCors(
    Response.json({
      window_days: WINDOW_DAYS,
      timezone,
      today: todayKey,
      peak_value: peakValue,
      peak_date: peakDate,
      days,
    }),
  );
}
