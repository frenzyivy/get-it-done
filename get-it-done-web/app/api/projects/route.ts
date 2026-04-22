import 'server-only';
import { requireUser, withCors, preflight, badRequest, serverError } from '../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

const VALID_STATUS = new Set(['active', 'paused', 'archived']);

// GET /api/projects — all for current user.
export async function GET() {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const { data, error: qErr } = await supa
    .from('projects')
    .select('id, name, color, status, sort_order, created_at')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });
  if (qErr) return withCors(serverError(qErr.message));

  return withCors(Response.json({ projects: data ?? [] }));
}

// POST /api/projects — create. Body: { name, color?, status? }.
export async function POST(req: Request) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    color?: string;
    status?: string;
  } | null;
  const name = body?.name?.trim();
  if (!name) return withCors(badRequest('name required'));
  const status = body?.status ?? 'active';
  if (!VALID_STATUS.has(status)) return withCors(badRequest('invalid status'));

  const { count } = await supa
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const { data, error: insErr } = await supa
    .from('projects')
    .insert({
      user_id: user.id,
      name,
      color: body?.color ?? '#7c3aed',
      status,
      sort_order: count ?? 0,
    })
    .select('id, name, color, status, sort_order, created_at')
    .single();
  if (insErr) {
    if (insErr.code === '23505') {
      return withCors(badRequest(`Project "${name}" already exists`));
    }
    return withCors(serverError(insErr.message));
  }
  return withCors(Response.json({ project: data }, { status: 201 }));
}
