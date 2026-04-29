import 'server-only';
import { requireUser, withCors, preflight, badRequest, serverError } from '../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Ctx {
  params: Promise<{ id: string }>;
}

// PATCH /api/saved-views/:id — rename and/or replace filters.
// Body: { name?, filters? }. view_type is immutable; create a new view to
// retarget a different view tab.
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    filters?: Record<string, unknown>;
  } | null;
  if (!body) return withCors(badRequest('invalid body'));

  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    const n = body.name.trim();
    if (!n) return withCors(badRequest('name cannot be empty'));
    updates.name = n;
  }
  if (body.filters && typeof body.filters === 'object') {
    updates.filters = body.filters;
  }
  if (Object.keys(updates).length === 0) {
    return withCors(badRequest('nothing to update'));
  }

  const { data, error: upErr } = await supa
    .from('saved_views')
    .update(updates)
    .eq('id', id)
    .select('id, name, view_type, filters, is_pinned, sort_order, created_at, updated_at')
    .single();
  if (upErr) {
    if (upErr.code === '23505') {
      return withCors(badRequest('A view with that name already exists for this view type'));
    }
    return withCors(serverError(upErr.message));
  }
  return withCors(Response.json({ saved_view: data }));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { supa, error } = await requireUser();
  if (error) return withCors(error);

  const { error: delErr } = await supa.from('saved_views').delete().eq('id', id);
  if (delErr) return withCors(serverError(delErr.message));
  return withCors(new Response(null, { status: 204 }));
}
