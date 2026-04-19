import 'server-only';
import { runAgent } from '@/lib/anthropic';
import { requireUser } from '../_require-user';
import { preflight, withCors } from '../_cors';
import type { Priority } from '@/types';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Body {
  task_title?: string;
  due_date?: string | null;
}

interface AgentOutput {
  priority: Priority;
  reasoning: string;
}

const ALLOWED: Priority[] = ['low', 'medium', 'high', 'urgent'];

const SYSTEM = `You assign a priority to a task.

Rules:
- Priority is one of: low, medium, high, urgent.
- "urgent" is only for things due today or overdue.
- "high" for this-week deadlines or blocking others.
- "low" for nice-to-haves with no deadline.
- Reasoning is ONE sentence, under 15 words.
- Return ONLY JSON: {"priority":"high","reasoning":"..."}`;

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json()) as Body;
  const title = body.task_title?.trim();
  if (!title) return withCors(Response.json({ error: 'task_title required' }, { status: 400 }));

  const today = new Date().toISOString().slice(0, 10);
  const userPrompt = `Today: ${today}\nTask: ${title}\nDue date: ${body.due_date ?? 'none'}`;

  try {
    const { data } = await runAgent<AgentOutput>({
      userId: user.id,
      agent: 'smart_priority',
      system: SYSTEM,
      user: userPrompt,
      maxTokens: 128,
      requestPayload: { task_title: title, due_date: body.due_date ?? null },
    });

    const priority: Priority = ALLOWED.includes(data.priority) ? data.priority : 'medium';

    return withCors(Response.json({
      priority,
      reasoning: (data.reasoning ?? '').slice(0, 200),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return withCors(Response.json({ error: message }, { status: 500 }));
  }
}
