import 'server-only';
import {
  requireUser,
  withCors,
  preflight,
  serverError,
} from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = () => preflight();

// GET /api/insights/honest-score?date=YYYY-MM-DD
//
// Returns the Honest Score for the requested day (defaults to yesterday).
// Formula per the Phase 7 brief:
//
//   planned_minutes  = sum of planned_blocks for the day
//   tracked_minutes  = sum of tracked_sessions (block_type='tracked') for the day
//   on_plan_minutes  = minutes of tracked time that fall inside a planned block
//   off_plan_minutes = tracked_minutes - on_plan_minutes
//   break_minutes    = sum of tracked_sessions (block_type='break') for the day
//   manual_minutes   = sum of rows where manually_entered = TRUE
//
//   honest_score = (on_plan_minutes / max(planned, tracked)) * 100
//
// All time math is done in seconds server-side; the client converts to mm/hh.

interface SessionRow {
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  block_type: string | null;
  manually_entered: boolean | null;
}

interface PlannedRow {
  start_at: string;
  duration_seconds: number;
}

interface ScoreResponse {
  date: string; // YYYY-MM-DD in user tz
  planned_seconds: number;
  tracked_seconds: number;
  on_plan_seconds: number;
  off_plan_seconds: number;
  break_seconds: number;
  manual_seconds: number;
  honest_score_pct: number; // 0..100, rounded to int
  manual_share_pct: number; // 0..100, rounded to int
  manual_caveat: boolean; // true when manual_share >= 30%
}

function yesterdayLocal(tz: string): string {
  const now = new Date();
  // Get today's local date string then subtract one day; cheaper than playing
  // with tz arithmetic. Off-by-one near midnight is acceptable for a yesterday-
  // by-default UI; the user can always pass date= explicitly.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const todayLocalISO = `${parts.year}-${parts.month}-${parts.day}`;
  // Walk back one day in calendar terms by constructing a Date from the local
  // ISO at noon (avoids DST edges) and subtracting 24h.
  const noon = new Date(`${todayLocalISO}T12:00:00Z`);
  const y = new Date(noon.getTime() - 24 * 3600 * 1000);
  const yParts = Object.fromEntries(
    fmt.formatToParts(y).map((p) => [p.type, p.value]),
  );
  return `${yParts.year}-${yParts.month}-${yParts.day}`;
}

// UTC bounds for "local YYYY-MM-DD in tz". Probes UTC ± offset to find the
// midnight instant that prints as `YYYY-MM-DD 00:00` in the target tz.
function dayWindowUtc(dateISO: string, tz: string): { from: Date; to: Date } {
  const guess = new Date(`${dateISO}T00:00:00Z`);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(guess).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offset = guess.getTime() - asUtc;
  const from = new Date(`${dateISO}T00:00:00Z`).getTime() + offset;
  const to = from + 24 * 3600 * 1000;
  return { from: new Date(from), to: new Date(to) };
}

// Overlap in seconds between two [start, end) intervals. Negative cap at 0.
function overlapSeconds(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  return Math.max(0, Math.floor((e - s) / 1000));
}

export async function GET(req: Request) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const { data: prefs, error: prefErr } = await supa
    .from('user_preferences')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();
  if (prefErr) return withCors(serverError(prefErr.message));
  const timezone = prefs?.timezone || 'UTC';

  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const dateISO = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : yesterdayLocal(timezone);

  const { from, to } = dayWindowUtc(dateISO, timezone);

  // --- tracked_sessions for the day --------------------------------------
  // Pull EVERY row for the day so we can compute overlap with planned blocks
  // server-side. We filter by started_at >= from AND < to to match the
  // convention used everywhere else (see get_day_stats: midnight-crossing
  // sessions bin entirely on their started_at day).
  const { data: sessionsData, error: sErr } = await supa
    .from('tracked_sessions')
    .select('started_at, ended_at, duration_seconds, block_type, manually_entered')
    .eq('user_id', user.id)
    .gte('started_at', from.toISOString())
    .lt('started_at', to.toISOString())
    .not('ended_at', 'is', null);
  if (sErr) return withCors(serverError(sErr.message));
  const sessions = (sessionsData ?? []) as SessionRow[];

  const { data: plannedData, error: pErr } = await supa
    .from('planned_blocks')
    .select('start_at, duration_seconds')
    .eq('user_id', user.id)
    .gte('start_at', from.toISOString())
    .lt('start_at', to.toISOString());
  if (pErr) return withCors(serverError(pErr.message));
  const planned = (plannedData ?? []) as PlannedRow[];

  // --- Bucket ----------------------------------------------------------
  // tracked: only block_type='tracked' (or null for legacy rows). break_type
  // rows feed break_seconds. manually_entered rows feed manual_seconds — they
  // can be either tracked or break, that's fine, the brief discounts them
  // either way.
  let trackedSecs = 0;
  let breakSecs = 0;
  let manualSecs = 0;
  const trackedIntervals: { startMs: number; endMs: number }[] = [];

  for (const s of sessions) {
    const dur = s.duration_seconds ?? 0;
    if (dur <= 0) continue;
    const isBreak = s.block_type === 'break';
    if (isBreak) {
      breakSecs += dur;
    } else {
      trackedSecs += dur;
      const startMs = new Date(s.started_at).getTime();
      // duration_seconds is the source of truth; ended_at can be wall-clock
      // (longer than dur, due to breaks). Anchor at started_at + dur*1000.
      trackedIntervals.push({
        startMs,
        endMs: startMs + dur * 1000,
      });
    }
    if (s.manually_entered) {
      manualSecs += dur;
    }
  }

  let plannedSecs = 0;
  const plannedIntervals: { startMs: number; endMs: number }[] = [];
  for (const p of planned) {
    if (p.duration_seconds <= 0) continue;
    plannedSecs += p.duration_seconds;
    const startMs = new Date(p.start_at).getTime();
    plannedIntervals.push({
      startMs,
      endMs: startMs + p.duration_seconds * 1000,
    });
  }

  // On-plan = sum of overlap between each tracked interval and the planned
  // windows. O(n*m) is fine — typical day has <50 of each.
  let onPlanSecs = 0;
  for (const t of trackedIntervals) {
    for (const p of plannedIntervals) {
      onPlanSecs += overlapSeconds(t.startMs, t.endMs, p.startMs, p.endMs);
    }
  }
  onPlanSecs = Math.min(onPlanSecs, trackedSecs); // cap by tracked total

  const offPlanSecs = Math.max(0, trackedSecs - onPlanSecs);
  const denom = Math.max(plannedSecs, trackedSecs);
  const score = denom > 0 ? Math.round((onPlanSecs / denom) * 100) : 0;
  const manualShare =
    trackedSecs + breakSecs > 0
      ? Math.round((manualSecs / (trackedSecs + breakSecs)) * 100)
      : 0;

  const body: ScoreResponse = {
    date: dateISO,
    planned_seconds: plannedSecs,
    tracked_seconds: trackedSecs,
    on_plan_seconds: onPlanSecs,
    off_plan_seconds: offPlanSecs,
    break_seconds: breakSecs,
    manual_seconds: manualSecs,
    honest_score_pct: score,
    manual_share_pct: manualShare,
    manual_caveat: manualShare >= 30,
  };

  return withCors(Response.json(body));
}
