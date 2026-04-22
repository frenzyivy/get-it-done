import 'server-only';
import { requireUser, withCors, preflight, badRequest, serverError } from '../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Ctx {
  params: Promise<{ id: string }>;
}

// PATCH /api/categories/:id — rename and/or recolor. Body: { name?, color? }.
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    color?: string;
  } | null;
  if (!body) return withCors(badRequest('invalid body'));

  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    const n = body.name.trim();
    if (!n) return withCors(badRequest('name cannot be empty'));
    updates.name = n;
  }
  if (typeof body.color === 'string') updates.color = body.color;
  if (Object.keys(updates).length === 0) {
    return withCors(badRequest('nothing to update'));
  }

  const { data, error: upErr } = await supa
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select('id, name, color, sort_order, created_at')
    .single();
  if (upErr) {
    if (upErr.code === '23505') {
      return withCors(badRequest('A category with that name already exists'));
    }
    return withCors(serverError(upErr.message));
  }
  return withCors(Response.json({ category: data }));
}

// DELETE /api/categories/:id — cascades to task_categories via FK.
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { supa, error } = await requireUser();
  if (error) return withCors(error);

  const { error: delErr } = await supa.from('categories').delete().eq('id', id);
  if (delErr) return withCors(serverError(delErr.message));
  return withCors(new Response(null, { status: 204 }));
}
