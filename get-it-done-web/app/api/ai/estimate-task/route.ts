import 'server-only';
import { runAgent } from '@/lib/anthropic';
import { requireUser } from '../_require-user';
import { preflight, withCors } from '../_cors';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Body {
  task_title?: string;
  subtasks?: string[];
}

interface AgentOutput {
  estimated_minutes: number;
  reasoning: string;
}

const SYSTEM = `You estimate how long a focused-work task takes.

Rules:
- Pick ONE of these minute values: 15, 25, 50, 60, 90, 120, 180.
- Account for any provided subtasks.
- Reasoning is ONE sentence, under 20 words.
- Return ONLY JSON: {"estimated_minutes":50,"reasoning":"..."}`;

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json()) as Body;
  const title = body.task_title?.trim();
  if (!title) return withCors(Response.json({ error: 'task_title required' }, { status: 400 }));

  const subtaskList = (body.subtasks ?? []).filter((s) => s && s.trim().length > 0);
  const userPrompt = subtaskList.length
    ? `Task: ${title}\nSubtasks:\n${subtaskList.map((s) => `- ${s}`).join('\n')}`
    : `Task: ${title}`;

  try {
    const { data } = await runAgent<AgentOutput>({
      userId: user.id,
      agent: 'estimate_task',
      system: SYSTEM,
      user: userPrompt,
      maxTokens: 256,
      requestPayload: { task_title: title, subtasks: subtaskList },
    });

    const allowed = [15, 25, 50, 60, 90, 120, 180];
    const minutes = allowed.includes(data.estimated_minutes) ? data.estimated_minutes : 50;

    return withCors(Response.json({
      estimated_seconds: minutes * 60,
      reasoning: (data.reasoning ?? '').slice(0, 200),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return withCors(Response.json({ error: message }, { status: 500 }));
  }
}
