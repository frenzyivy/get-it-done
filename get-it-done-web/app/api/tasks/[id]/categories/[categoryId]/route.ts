import 'server-only';
import { requireUser, withCors, preflight, serverError } from '../../../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Ctx {
  params: Promise<{ id: string; categoryId: string }>;
}

// DELETE /api/tasks/:id/categories/:categoryId — detach a category from a task.
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: taskId, categoryId } = await ctx.params;
  const { supa, error } = await requireUser();
  if (error) return withCors(error);

  const { error: delErr } = await supa
    .from('task_categories')
    .delete()
    .eq('task_id', taskId)
    .eq('category_id', categoryId);
  if (delErr) return withCors(serverError(delErr.message));
  return withCors(new Response(null, { status: 204 }));
}
