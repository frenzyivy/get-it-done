import 'server-only';
import { requireUser } from '../ai/_require-user';
import { preflight, withCors } from '../ai/_cors';
import type {
  InsightsPayload,
  InsightsBucket,
  InsightsProjectBucket,
  InsightsTagBucket,
  InsightsMatrixRow,
  InsightsTask,
  InsightsRange,
} from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = () => preflight();

// Truth source for tracked time is the `tracked_sessions` table (v2 live timer).
// `time_sessions` is legacy and kept for backwards-compat. See AGENT2_CHANGES.md.
interface SessionRow {
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

interface CategoryRow { id: string; name: string; color: string }
interface ProjectRow { id: string; name: string; color: string; status: string }
interface TagRow { id: string; name: string }
interface TaskTitleRow { id: string; title: string }
interface LinkRow { task_id: string; category_id?: string; project_id?: string; tag_id?: string }

type Supa = SupabaseClient;

function weekStartSunLocal(tz: string, now: Date): Date {
  // Get "now" in the user's timezone, find Sunday 00:00 local, then back to UTC.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = weekdayMap[parts.weekday] ?? 0;
  // Construct a UTC timestamp for "today at 00:00 in tz", then walk back dow days.
  // Simplest: take the local YYYY-MM-DD and reconstruct midnight in tz via Date parsing.
  const localDateISO = `${parts.year}-${parts.month}-${parts.day}`;
  const midnightLocal = tzDateToUtc(localDateISO, '00:00:00', tz);
  const start = new Date(midnightLocal.getTime() - dow * 24 * 3600 * 1000);
  return start;
}

function monthStartLocal(tz: string, now: Date): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return tzDateToUtc(`${parts.year}-${parts.month}-01`, '00:00:00', tz);
}

// Given a local calendar date (YYYY-MM-DD) + time in the given IANA timezone,
// return the corresponding UTC Date. Works by probing UTC ± tz offset.
function tzDateToUtc(dateISO: string, time: string, tz: string): Date {
  const guess = new Date(`${dateISO}T${time}Z`);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(guess).map((p) => [p.type, p.value]));
  const asLocal = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  const offset = asLocal - guess.getTime();
  return new Date(guess.getTime() - offset);
}

function resolveRange(range: InsightsRange, tz: string): { start: Date | null; end: Date; prevStart: Date | null; prevEnd: Date | null } {
  const end = new Date();
  if (range === 'all') {
    return { start: null, end, prevStart: null, prevEnd: null };
  }
  if (range === 'week') {
    const start = weekStartSunLocal(tz, end);
    const span = end.getTime() - start.getTime();
    const prevEnd = start;
    const prevStart = new Date(start.getTime() - 7 * 24 * 3600 * 1000);
    void span;
    return { start, end, prevStart, prevEnd };
  }
  // month
  const start = monthStartLocal(tz, end);
  const prevEnd = start;
  // Previous month's 1st: roll back one calendar month in local tz.
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(start.getTime() - 1)).map((p) => [p.type, p.value]));
  const prevStart = tzDateToUtc(`${parts.year}-${parts.month}-01`, '00:00:00', tz);
  return { start, end, prevStart, prevEnd };
}

// Agent 1's schema may not be migrated yet; swallow "missing table / relation"
// so the page degrades instead of 500ing.
//   Postgres raw:  42P01 "relation does not exist"
//   PostgREST:     PGRST205 "Could not find the table X in the schema cache"
//                  PGRST204 "column not found"
//                  PGRST200 "Could not find a relationship between X and Y"
function isMissingTable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST200' || e.code === 'PGRST204') {
    return true;
  }
  const msg = typeof e.message === 'string' ? e.message : '';
  if (/does not exist/i.test(msg)) return true;
  if (/schema cache/i.test(msg)) return true;
  return false;
}

async function fetchRowsSafe<T>(supa: Supa, query: unknown): Promise<{ rows: T[]; missing: boolean }> {
  const { data, error } = await (query as Promise<{ data: T[] | null; error: unknown }>);
  if (error) {
    if (isMissingTable(error)) return { rows: [], missing: true };
    throw error;
  }
  void supa;
  return { rows: (data ?? []) as T[], missing: false };
}

export async function GET(req: Request) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const { searchParams } = new URL(req.url);
  const range = (searchParams.get('range') ?? 'month') as InsightsRange;
  if (!['week', 'month', 'all'].includes(range)) {
    return withCors(Response.json({ error: 'invalid range' }, { status: 400 }));
  }

  // Pull tz for day-bucketing. Fall back to UTC.
  const { data: prefs } = await supa
    .from('user_preferences')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();
  const tz = (prefs?.timezone as string | undefined) || 'UTC';

  const { start, end, prevStart, prevEnd } = resolveRange(range, tz);

  try {
    // --- Sessions in range --------------------------------------------------
    let q = supa
      .from('tracked_sessions')
      .select('task_id, started_at, ended_at, duration_seconds')
      .eq('user_id', user.id)
      .not('ended_at', 'is', null)
      .not('duration_seconds', 'is', null);
    if (start) q = q.gte('ended_at', start.toISOString());
    q = q.lt('ended_at', end.toISOString());
    const { data: sessionsData, error: sessErr } = await q;
    if (sessErr) throw sessErr;
    const sessions = (sessionsData ?? []) as SessionRow[];

    // Previous period for delta.
    let totalSecondsPrev = 0;
    if (prevStart && prevEnd) {
      const { data: prevData, error: prevErr } = await supa
        .from('tracked_sessions')
        .select('duration_seconds')
        .eq('user_id', user.id)
        .not('ended_at', 'is', null)
        .not('duration_seconds', 'is', null)
        .gte('ended_at', prevStart.toISOString())
        .lt('ended_at', prevEnd.toISOString());
      if (prevErr) throw prevErr;
      totalSecondsPrev = (prevData ?? []).reduce(
        (s, r) => s + ((r.duration_seconds as number | null) ?? 0),
        0,
      );
    }

    // task_id -> total seconds in range
    const taskSeconds = new Map<string, number>();
    let totalSeconds = 0;
    for (const s of sessions) {
      if (!s.task_id || !s.duration_seconds) continue;
      totalSeconds += s.duration_seconds;
      taskSeconds.set(s.task_id, (taskSeconds.get(s.task_id) ?? 0) + s.duration_seconds);
    }
    const taskIds = Array.from(taskSeconds.keys());

    // --- Task titles (for recent-tasks table) -------------------------------
    let tasksById = new Map<string, string>();
    if (taskIds.length > 0) {
      const { data, error: taskErr } = await supa
        .from('tasks')
        .select('id, title')
        .in('id', taskIds);
      if (taskErr) throw taskErr;
      tasksById = new Map(((data ?? []) as TaskTitleRow[]).map((t) => [t.id, t.title]));
    }

    // --- Categories, projects, and the join tables (Agent 1's schema) -------
    const catRes = await fetchRowsSafe<CategoryRow>(
      supa,
      supa.from('categories').select('id, name, color').eq('user_id', user.id),
    );
    const projRes = await fetchRowsSafe<ProjectRow>(
      supa,
      supa.from('projects').select('id, name, color, status').eq('user_id', user.id),
    );
    const missingLabelSchema = catRes.missing || projRes.missing;

    const taskCatRes = taskIds.length === 0 || catRes.missing
      ? { rows: [], missing: catRes.missing }
      : await fetchRowsSafe<LinkRow>(
          supa,
          supa.from('task_categories').select('task_id, category_id').in('task_id', taskIds),
        );
    const taskProjRes = taskIds.length === 0 || projRes.missing
      ? { rows: [], missing: projRes.missing }
      : await fetchRowsSafe<LinkRow>(
          supa,
          supa.from('task_projects').select('task_id, project_id').in('task_id', taskIds),
        );

    // --- Tags (existing schema) --------------------------------------------
    const { data: tagsData, error: tagsErr } = await supa
      .from('tags')
      .select('id, name')
      .eq('user_id', user.id);
    if (tagsErr) throw tagsErr;
    const tagsById = new Map(
      ((tagsData ?? []) as TagRow[]).map((t) => [t.id, t.name]),
    );

    let taskTagsRows: LinkRow[] = [];
    if (taskIds.length > 0) {
      const { data, error: ttErr } = await supa
        .from('task_tags')
        .select('task_id, tag_id')
        .in('task_id', taskIds);
      if (ttErr) throw ttErr;
      taskTagsRows = (data ?? []) as LinkRow[];
    }

    // --- Aggregations -------------------------------------------------------
    const categoriesMap = new Map<string, CategoryRow>(catRes.rows.map((c) => [c.id, c]));
    const projectsMap = new Map<string, ProjectRow>(projRes.rows.map((p) => [p.id, p]));

    // Category buckets
    const catSeconds = new Map<string, number>();
    for (const link of taskCatRes.rows) {
      if (!link.task_id || !link.category_id) continue;
      const sec = taskSeconds.get(link.task_id) ?? 0;
      if (sec <= 0) continue;
      catSeconds.set(link.category_id, (catSeconds.get(link.category_id) ?? 0) + sec);
    }
    const categoryBuckets: InsightsBucket[] = Array.from(catSeconds.entries())
      .map(([id, total_seconds]) => {
        const c = categoriesMap.get(id);
        if (!c) return null;
        return { id, name: c.name, color: c.color, total_seconds };
      })
      .filter((b): b is InsightsBucket => b !== null)
      .sort((a, b) => b.total_seconds - a.total_seconds);

    // Project buckets (with task count)
    const projSeconds = new Map<string, number>();
    const projTaskSet = new Map<string, Set<string>>();
    for (const link of taskProjRes.rows) {
      if (!link.task_id || !link.project_id) continue;
      const sec = taskSeconds.get(link.task_id) ?? 0;
      if (sec <= 0) continue;
      projSeconds.set(link.project_id, (projSeconds.get(link.project_id) ?? 0) + sec);
      if (!projTaskSet.has(link.project_id)) projTaskSet.set(link.project_id, new Set());
      projTaskSet.get(link.project_id)!.add(link.task_id);
    }
    const projectBuckets: InsightsProjectBucket[] = Array.from(projSeconds.entries())
      .map(([id, total_seconds]) => {
        const p = projectsMap.get(id);
        if (!p) return null;
        return {
          id,
          name: p.name,
          color: p.color,
          status: (p.status as 'active' | 'paused' | 'archived') ?? 'active',
          total_seconds,
          task_count: projTaskSet.get(id)?.size ?? 0,
        };
      })
      .filter((b): b is InsightsProjectBucket => b !== null)
      .sort((a, b) => b.total_seconds - a.total_seconds);

    // Matrix: project × category cells
    const matrixCells = new Map<string, Map<string, number>>();
    const catsOnTask = new Map<string, string[]>();
    const projsOnTask = new Map<string, string[]>();
    for (const l of taskCatRes.rows) {
      if (!l.task_id || !l.category_id) continue;
      if (!catsOnTask.has(l.task_id)) catsOnTask.set(l.task_id, []);
      catsOnTask.get(l.task_id)!.push(l.category_id);
    }
    for (const l of taskProjRes.rows) {
      if (!l.task_id || !l.project_id) continue;
      if (!projsOnTask.has(l.task_id)) projsOnTask.set(l.task_id, []);
      projsOnTask.get(l.task_id)!.push(l.project_id);
    }
    for (const [taskId, sec] of taskSeconds.entries()) {
      const cs = catsOnTask.get(taskId);
      const ps = projsOnTask.get(taskId);
      if (!cs || !ps) continue;
      for (const pid of ps) {
        if (!matrixCells.has(pid)) matrixCells.set(pid, new Map());
        const row = matrixCells.get(pid)!;
        for (const cid of cs) {
          row.set(cid, (row.get(cid) ?? 0) + sec);
        }
      }
    }
    const matrixRows: InsightsMatrixRow[] = projectBuckets.map((p) => {
      const row = matrixCells.get(p.id) ?? new Map<string, number>();
      const cells: Record<string, number> = {};
      for (const [cid, sec] of row) cells[cid] = sec;
      return {
        project_id: p.id,
        project_name: p.name,
        project_color: p.color,
        cells,
        total_seconds: p.total_seconds,
      };
    });

    // Per-project drill-down: categories filtered to this project's tasks.
    const categoriesByProject: Record<string, InsightsBucket[]> = {};
    for (const p of projectBuckets) {
      const projTaskIds = projTaskSet.get(p.id) ?? new Set<string>();
      const agg = new Map<string, number>();
      for (const l of taskCatRes.rows) {
        if (!l.task_id || !l.category_id) continue;
        if (!projTaskIds.has(l.task_id)) continue;
        const sec = taskSeconds.get(l.task_id) ?? 0;
        if (sec <= 0) continue;
        agg.set(l.category_id, (agg.get(l.category_id) ?? 0) + sec);
      }
      categoriesByProject[p.id] = Array.from(agg.entries())
        .map(([id, total_seconds]) => {
          const c = categoriesMap.get(id);
          if (!c) return null;
          return { id, name: c.name, color: c.color, total_seconds };
        })
        .filter((b): b is InsightsBucket => b !== null)
        .sort((a, b) => b.total_seconds - a.total_seconds);
    }

    // Recent tasks per project (top 8 by time).
    const tasksByProject: Record<string, InsightsTask[]> = {};
    for (const p of projectBuckets) {
      const projTaskIds = Array.from(projTaskSet.get(p.id) ?? []);
      const items: InsightsTask[] = projTaskIds
        .map((tid) => {
          const title = tasksById.get(tid) ?? '(untitled)';
          const sec = taskSeconds.get(tid) ?? 0;
          const catIds = catsOnTask.get(tid) ?? [];
          const cats = catIds
            .map((cid) => categoriesMap.get(cid))
            .filter((c): c is CategoryRow => !!c)
            .map((c) => ({ id: c.id, name: c.name, color: c.color }));
          return { id: tid, title, total_seconds: sec, categories: cats };
        })
        .filter((t) => t.total_seconds > 0)
        .sort((a, b) => b.total_seconds - a.total_seconds)
        .slice(0, 8);
      tasksByProject[p.id] = items;
    }

    // Tag cloud + double-filter
    const tagSeconds = new Map<string, number>();
    const tagsOnTask = new Map<string, string[]>();
    for (const l of taskTagsRows) {
      if (!l.task_id || !l.tag_id) continue;
      const sec = taskSeconds.get(l.task_id) ?? 0;
      if (sec <= 0) continue;
      tagSeconds.set(l.tag_id, (tagSeconds.get(l.tag_id) ?? 0) + sec);
      if (!tagsOnTask.has(l.task_id)) tagsOnTask.set(l.task_id, []);
      tagsOnTask.get(l.task_id)!.push(l.tag_id);
    }
    const tagBuckets: InsightsTagBucket[] = Array.from(tagSeconds.entries())
      .map(([id, total_seconds]) => {
        const name = tagsById.get(id);
        if (!name) return null;
        return { id, name, total_seconds };
      })
      .filter((t): t is InsightsTagBucket => t !== null)
      .sort((a, b) => b.total_seconds - a.total_seconds);

    const categoriesByTag: Record<string, InsightsBucket[]> = {};
    for (const t of tagBuckets) {
      const agg = new Map<string, number>();
      // For each task that has this tag, split its time into each of its categories.
      for (const [taskId, tagIds] of tagsOnTask.entries()) {
        if (!tagIds.includes(t.id)) continue;
        const sec = taskSeconds.get(taskId) ?? 0;
        if (sec <= 0) continue;
        const cs = catsOnTask.get(taskId) ?? [];
        for (const cid of cs) {
          agg.set(cid, (agg.get(cid) ?? 0) + sec);
        }
      }
      categoriesByTag[t.id] = Array.from(agg.entries())
        .map(([id, total_seconds]) => {
          const c = categoriesMap.get(id);
          if (!c) return null;
          return { id, name: c.name, color: c.color, total_seconds };
        })
        .filter((b): b is InsightsBucket => b !== null)
        .sort((a, b) => b.total_seconds - a.total_seconds);
    }

    // Deepest-work day: sum session duration per local calendar day (by ended_at).
    const dayFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const dayMap = new Map<string, number>();
    for (const s of sessions) {
      if (!s.ended_at || !s.duration_seconds) continue;
      const parts = Object.fromEntries(
        dayFmt.formatToParts(new Date(s.ended_at)).map((p) => [p.type, p.value]),
      );
      const key = `${parts.year}-${parts.month}-${parts.day}`;
      dayMap.set(key, (dayMap.get(key) ?? 0) + s.duration_seconds);
    }
    let deepestDay: { date: string; total_seconds: number } | null = null;
    for (const [date, sec] of dayMap) {
      if (!deepestDay || sec > deepestDay.total_seconds) {
        deepestDay = { date, total_seconds: sec };
      }
    }

    const topCategory = categoryBuckets[0] ?? null;
    const topCategoryPct = topCategory && totalSeconds > 0
      ? Math.round((topCategory.total_seconds / totalSeconds) * 100)
      : 0;
    const topProject = projectBuckets[0] ?? null;

    const payload: InsightsPayload = {
      range,
      range_start: start ? start.toISOString() : null,
      range_end: end.toISOString(),
      summary: {
        total_seconds: totalSeconds,
        total_seconds_prev: totalSecondsPrev,
        task_count: taskIds.length,
        top_category: topCategory,
        top_category_pct: topCategoryPct,
        top_project: topProject,
        deepest_day: deepestDay,
      },
      categories: categoryBuckets,
      projects: projectBuckets,
      matrix: {
        category_order: categoryBuckets.map((c) => ({ id: c.id, name: c.name, color: c.color })),
        rows: matrixRows,
      },
      tasks_by_project: tasksByProject,
      categories_by_project: categoriesByProject,
      tags: tagBuckets,
      categories_by_tag: categoriesByTag,
      missing_label_schema: missingLabelSchema || undefined,
    };

    return withCors(Response.json(payload));
  } catch (err) {
    // Surface real Postgres/PostgREST details so failures are debuggable. The
    // client still renders a graceful error card; nothing sensitive is leaked.
    console.error('[api/insights] failed', err);
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    const message = e?.message || (err instanceof Error ? err.message : 'Unknown error');
    return withCors(
      Response.json(
        { error: message, code: e?.code, details: e?.details, hint: e?.hint },
        { status: 500 },
      ),
    );
  }
}
