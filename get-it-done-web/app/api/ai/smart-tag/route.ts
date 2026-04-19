import 'server-only';
import { runAgent } from '@/lib/anthropic';
import { requireUser } from '../_require-user';
import { preflight, withCors } from '../_cors';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Body { task_title?: string }
interface AgentOutput {
  suggestions: { tag_id: string; confidence: number }[];
}

const SYSTEM = `You classify a task into the user's own tags.

Rules:
- Pick at most 2 tags from the provided list. Return none if nothing fits.
- Confidence is 0.0–1.0. Only return suggestions with confidence >= 0.55.
- Never invent a tag_id. Use only the ids provided.
- Return ONLY JSON: {"suggestions":[{"tag_id":"<uuid>","confidence":0.82}]}`;

export async function POST(req: Request) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json()) as Body;
  const title = body.task_title?.trim();
  if (!title) return withCors(Response.json({ error: 'task_title required' }, { status: 400 }));

  const { data: tags, error: tagErr } = await supa
    .from('tags')
    .select('id, name')
    .order('sort_order');
  if (tagErr) return withCors(Response.json({ error: tagErr.message }, { status: 500 }));
  if (!tags || tags.length === 0) return withCors(Response.json({ suggestions: [] }));

  const userPrompt = `Task: ${title}\n\nAvailable tags:\n${tags
    .map((t) => `- ${t.id}: ${t.name}`)
    .join('\n')}`;

  try {
    const { data } = await runAgent<AgentOutput>({
      userId: user.id,
      agent: 'smart_tag',
      system: SYSTEM,
      user: userPrompt,
      maxTokens: 256,
      requestPayload: { task_title: title, tag_count: tags.length },
    });

    const validIds = new Set(tags.map((t) => t.id));
    const nameById = new Map(tags.map((t) => [t.id, t.name]));
    const suggestions = (data.suggestions ?? [])
      .filter((s) => validIds.has(s.tag_id) && s.confidence >= 0.55)
      .slice(0, 2)
      .map((s) => ({ tag_id: s.tag_id, name: nameById.get(s.tag_id)!, confidence: s.confidence }));

    return withCors(Response.json({ suggestions }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return withCors(Response.json({ error: message }, { status: 500 }));
  }
}
