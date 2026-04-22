import 'server-only';
import { runAgent } from '@/lib/anthropic';
import { requireUser } from '../_require-user';
import { preflight, withCors } from '../_cors';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Body {
  task_title?: string;
}

interface AgentOutput {
  category_ids?: string[];
  project_ids?: string[];
}

const SYSTEM = `You classify a task by assigning it to the user's own categories and projects.

Rules:
- Category answers "what kind of work" (e.g. development, content, outreach).
  Pick at most 2 category ids.
- Project answers "what thing this is for". Pick 0 or 1 project id unless the
  task obviously spans multiple projects (rare).
- Return none if nothing fits — it is OK to return empty arrays.
- Never invent ids. Use only the ids provided in the prompt.
- Only return active projects (provided list already filters to active).
- Return ONLY JSON: {"category_ids":["<uuid>"],"project_ids":["<uuid>"]}`;

export async function POST(req: Request) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json()) as Body;
  const title = body.task_title?.trim();
  if (!title) {
    return withCors(Response.json({ error: 'task_title required' }, { status: 400 }));
  }

  const [catRes, projRes] = await Promise.all([
    supa.from('categories').select('id, name').order('sort_order'),
    supa
      .from('projects')
      .select('id, name, status')
      .eq('status', 'active')
      .order('sort_order'),
  ]);
  if (catRes.error) {
    return withCors(Response.json({ error: catRes.error.message }, { status: 500 }));
  }
  if (projRes.error) {
    return withCors(Response.json({ error: projRes.error.message }, { status: 500 }));
  }

  const categories = catRes.data ?? [];
  const projects = projRes.data ?? [];

  if (categories.length === 0 && projects.length === 0) {
    return withCors(Response.json({ category_ids: [], project_ids: [] }));
  }

  const userPrompt = [
    `Task: ${title}`,
    '',
    'Available categories:',
    categories.length === 0
      ? '  (none — return empty category_ids)'
      : categories.map((c) => `- ${c.id}: ${c.name}`).join('\n'),
    '',
    'Available active projects:',
    projects.length === 0
      ? '  (none — return empty project_ids)'
      : projects.map((p) => `- ${p.id}: ${p.name}`).join('\n'),
  ].join('\n');

  try {
    const { data } = await runAgent<AgentOutput>({
      userId: user.id,
      agent: 'suggest_labels',
      system: SYSTEM,
      user: userPrompt,
      maxTokens: 256,
      requestPayload: {
        task_title: title,
        category_count: categories.length,
        project_count: projects.length,
      },
    });

    const validCatIds = new Set(categories.map((c) => c.id));
    const validProjIds = new Set(projects.map((p) => p.id));
    const catIds = (data.category_ids ?? [])
      .filter((id) => validCatIds.has(id))
      .slice(0, 2);
    const projIds = (data.project_ids ?? [])
      .filter((id) => validProjIds.has(id))
      .slice(0, 2);

    return withCors(Response.json({ category_ids: catIds, project_ids: projIds }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return withCors(Response.json({ error: message }, { status: 500 }));
  }
}
