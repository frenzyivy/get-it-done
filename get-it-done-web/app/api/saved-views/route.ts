import 'server-only';
import { requireUser, withCors, preflight, badRequest, serverError } from '../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

const VALID_VIEW_TYPES = new Set(['board', 'list', 'priority', 'calendar']);

// GET /api/saved-views?view_type=board — all views for current user, optionally
// filtered to one view_type. Returned in (sort_order, created_at) order.
export async function GET(req: Request) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const url = new URL(req.url);
  const viewType = url.searchParams.get('view_type');
  if (viewType && !VALID_VIEW_TYPES.has(viewType)) {
    return withCors(badRequest('invalid view_type'));
  }

  let q = supa
    .from('saved_views')
    .select('id, name, view_type, filters, is_pinned, sort_order, created_at, updated_at')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (viewType) q = q.eq('view_type', viewType);

  const { data, error: qErr } = await q;
  if (qErr) return withCors(serverError(qErr.message));
  return withCors(Response.json({ saved_views: data ?? [] }));
}

// POST /api/saved-views — create. Body: { name, view_type, filters }.
export async function POST(req: Request) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    view_type?: string;
    filters?: Record<string, unknown>;
  } | null;
  const name = body?.name?.trim();
  const viewType = body?.view_type;
  if (!name) return withCors(badRequest('name required'));
  if (!viewType || !VALID_VIEW_TYPES.has(viewType)) {
    return withCors(badRequest('invalid view_type'));
  }
  const filters = body?.filters ?? {};

  const { data, error: insErr } = await supa
    .from('saved_views')
    .insert({
      user_id: user.id,
      name,
      view_type: viewType,
      filters,
    })
    .select('id, name, view_type, filters, is_pinned, sort_order, created_at, updated_at')
    .single();
  if (insErr) {
    if (insErr.code === '23505') {
      return withCors(badRequest(`A view named "${name}" already exists for this view type`));
    }
    return withCors(serverError(insErr.message));
  }
  return withCors(Response.json({ saved_view: data }, { status: 201 }));
}
