import 'server-only';
import { requireUser, withCors, preflight, serverError } from '../../../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Ctx {
  params: Promise<{ id: string; projectId: string }>;
}

// DELETE /api/tasks/:id/projects/:projectId — detach a project from a task.
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: taskId, projectId } = await ctx.params;
  const { supa, error } = await requireUser();
  if (error) return withCors(error);

  const { error: delErr } = await supa
    .from('task_projects')
    .delete()
    .eq('task_id', taskId)
    .eq('project_id', projectId);
  if (delErr) return withCors(serverError(delErr.message));
  return withCors(new Response(null, { status: 204 }));
}
