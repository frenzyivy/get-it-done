import 'server-only';
import { requireUser, withCors, preflight, badRequest, serverError } from '../../../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Ctx {
  params: Promise<{ id: string }>;
}

// POST /api/tasks/:id/projects — attach one project to a task.
// Body: { project_id }. Idempotent.
export async function POST(req: Request, ctx: Ctx) {
  const { id: taskId } = await ctx.params;
  const { supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json().catch(() => null)) as { project_id?: string } | null;
  const projectId = body?.project_id;
  if (!projectId) return withCors(badRequest('project_id required'));

  const { error: insErr } = await supa
    .from('task_projects')
    .insert({ task_id: taskId, project_id: projectId });
  if (insErr && insErr.code !== '23505') {
    return withCors(serverError(insErr.message));
  }
  return withCors(Response.json({ ok: true }, { status: 201 }));
}
