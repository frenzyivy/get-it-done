import 'server-only';
import type { TrackedSession } from '@/types';
import {
  requireUser,
  withCors,
  preflight,
  badRequest,
  serverError,
} from '../../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

const SELECT_COLS =
  'id, user_id, task_id, subtask_id, planned_block_id, started_at, ended_at, ' +
  'duration_seconds, mode, was_paused, drift_events, broken, broken_reason, ' +
  'planned_duration_seconds';

interface Ctx {
  params: Promise<{ id: string }>;
}

interface StopBody {
  // Optional override — Focus Lock 'No Mercy' uses this when the user
  // exits early; the Strict trigger then resets the streak.
  broken?: boolean;
  broken_reason?: string | null;
}

// POST /api/sessions/:id/stop — close an active tracking session.
//
// Sets ended_at = now() and computes duration_seconds = now() - started_at.
// RLS keeps a user from stopping someone else's session; the .single()
// guarantees the row belongs to them. Already-stopped sessions return 400.
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json().catch(() => null)) as StopBody | null;

  // Fetch the row first so we can compute duration_seconds without trusting
  // a client-supplied value, and so we can 400 cleanly if it's already closed.
  const { data: existingRaw, error: fetchErr } = await supa
    .from('tracked_sessions')
    .select(SELECT_COLS)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (fetchErr) return withCors(serverError(fetchErr.message));
  if (!existingRaw) return withCors(badRequest('session not found'));
  const existing = existingRaw as unknown as TrackedSession;
  if (existing.ended_at !== null) {
    return withCors(badRequest('session already stopped'));
  }

  const now = new Date();
  const startedAt = new Date(existing.started_at);
  const durationSeconds = Math.max(
    0,
    Math.floor((now.getTime() - startedAt.getTime()) / 1000),
  );

  const updates: Record<string, unknown> = {
    ended_at: now.toISOString(),
    duration_seconds: durationSeconds,
  };
  if (typeof body?.broken === 'boolean') {
    updates.broken = body.broken;
    updates.broken_reason = body.broken_reason ?? null;
  }

  // Phase 6 hardening — concurrency: only update rows still open. Without
  // this predicate, two parallel stop calls would both succeed and the
  // second would overwrite the first's ended_at + duration. With it, the
  // second call gets PGRST116 (zero rows updated) and we surface the
  // already-stopped state cleanly.
  const { data, error: updErr } = await supa
    .from('tracked_sessions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('ended_at', null)
    .select(SELECT_COLS)
    .maybeSingle();
  if (updErr) return withCors(serverError(updErr.message));
  if (!data) {
    // Lost the race to a concurrent stop. The row's already closed.
    return withCors(badRequest('session already stopped'));
  }

  return withCors(Response.json({ session: data }));
}
