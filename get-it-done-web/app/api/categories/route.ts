import 'server-only';
import { requireUser, withCors, preflight, badRequest, serverError } from '../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

// GET /api/categories — all for current user.
export async function GET() {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const { data, error: qErr } = await supa
    .from('categories')
    .select('id, name, color, sort_order, created_at')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });
  if (qErr) return withCors(serverError(qErr.message));

  return withCors(Response.json({ categories: data ?? [] }));
}

// POST /api/categories — create. Body: { name, color? }.
export async function POST(req: Request) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    color?: string;
  } | null;
  const name = body?.name?.trim();
  if (!name) return withCors(badRequest('name required'));

  // sort_order = current count, so new entries append.
  const { count } = await supa
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const { data, error: insErr } = await supa
    .from('categories')
    .insert({
      user_id: user.id,
      name,
      color: body?.color ?? '#64748b',
      sort_order: count ?? 0,
    })
    .select('id, name, color, sort_order, created_at')
    .single();
  if (insErr) {
    // 23505 = unique_violation — friendlier message for the common case.
    if (insErr.code === '23505') {
      return withCors(badRequest(`Category "${name}" already exists`));
    }
    return withCors(serverError(insErr.message));
  }
  return withCors(Response.json({ category: data }, { status: 201 }));
}
