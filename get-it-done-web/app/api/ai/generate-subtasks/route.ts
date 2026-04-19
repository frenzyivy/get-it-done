import 'server-only';
import { runAgent } from '@/lib/anthropic';
import { requireUser } from '../_require-user';
import { preflight, withCors } from '../_cors';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Body { task_title?: string }
interface AgentOutput { subtasks: { title: string }[] }

const SYSTEM = `You break a user's task into 3–6 concrete subtasks.

Rules:
- Each subtask is a short imperative phrase (2–8 words).
- Order them so the user can complete them top-to-bottom.
- Don't restate the parent task. Don't add fluff ("plan", "review", "finalize").
- Return ONLY JSON in the shape: {"subtasks":[{"title":"..."}]}`;

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json()) as Body;
  const title = body.task_title?.trim();
  if (!title) return withCors(Response.json({ error: 'task_title required' }, { status: 400 }));

  try {
    const { data } = await runAgent<AgentOutput>({
      userId: user.id,
      agent: 'generate_subtasks',
      system: SYSTEM,
      user: `Task: ${title}`,
      maxTokens: 512,
      requestPayload: { task_title: title },
    });

    const subtasks = (data.subtasks ?? [])
      .filter((s) => typeof s?.title === 'string' && s.title.trim().length > 0)
      .slice(0, 8)
      .map((s) => ({ title: s.title.trim() }));

    return withCors(Response.json({ subtasks }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return withCors(Response.json({ error: message }, { status: 500 }));
  }
}
