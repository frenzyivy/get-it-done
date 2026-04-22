import 'server-only';
import { requireUser, withCors, preflight, badRequest, serverError } from '../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

const VALID_STATUS = new Set(['active', 'paused', 'archived']);

interface Ctx {
  params: Promise<{ id: string }>;
}

// PATCH /api/projects/:id — rename, recolor, and/or change status.
// Body: { name?, color?, status? }.
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    color?: string;
    status?: string;
  } | null;
  if (!body) return withCors(badRequest('invalid body'));

  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    const n = body.name.trim();
    if (!n) return withCors(badRequest('name cannot be empty'));
    updates.name = n;
  }
  if (typeof body.color === 'string') updates.color = body.color;
  if (typeof body.status === 'string') {
    if (!VALID_STATUS.has(body.status)) return withCors(badRequest('invalid status'));
    updates.status = body.status;
  }
  if (Object.keys(updates).length === 0) {
    return withCors(badRequest('nothing to update'));
  }

  const { data, error: upErr } = await supa
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select('id, name, color, status, sort_order, created_at')
    .single();
  if (upErr) {
    if (upErr.code === '23505') {
      return withCors(badRequest('A project with that name already exists'));
    }
    return withCors(serverError(upErr.message));
  }
  return withCors(Response.json({ project: data }));
}

// DELETE /api/projects/:id — cascades to task_projects via FK.
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { supa, error } = await requireUser();
  if (error) return withCors(error);

  const { error: delErr } = await supa.from('projects').delete().eq('id', id);
  if (delErr) return withCors(serverError(delErr.message));
  return withCors(new Response(null, { status: 204 }));
}
