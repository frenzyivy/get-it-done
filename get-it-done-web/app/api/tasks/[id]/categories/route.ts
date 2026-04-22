import 'server-only';
import { requireUser, withCors, preflight, badRequest, serverError } from '../../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Ctx {
  params: Promise<{ id: string }>;
}

// POST /api/tasks/:id/categories — attach one category to a task.
// Body: { category_id }. Idempotent: inserting an existing pair is a no-op
// (PK conflict is silently ignored).
export async function POST(req: Request, ctx: Ctx) {
  const { id: taskId } = await ctx.params;
  const { supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json().catch(() => null)) as { category_id?: string } | null;
  const categoryId = body?.category_id;
  if (!categoryId) return withCors(badRequest('category_id required'));

  const { error: insErr } = await supa
    .from('task_categories')
    .insert({ task_id: taskId, category_id: categoryId });
  if (insErr && insErr.code !== '23505') {
    return withCors(serverError(insErr.message));
  }
  return withCors(Response.json({ ok: true }, { status: 201 }));
}
