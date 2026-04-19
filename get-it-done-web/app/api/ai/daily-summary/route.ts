import 'server-only';
import { runAgent } from '@/lib/anthropic';
import { requireUser } from '../_require-user';
import { preflight, withCors } from '../_cors';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

interface Body { date?: string }

interface AgentOutput {
  headline: string;
  wins: string[];
  focus_for_tomorrow: string[];
  observations: string[];
}

const SYSTEM = `You write a short, honest end-of-day summary for a solo operator.

Rules:
- Tone: calm, specific, first-person ("you"). No cheerleading, no emojis.
- Headline: ONE sentence under 90 chars that captures the day's shape.
- wins: up to 3, each under 12 words, concrete (reference task titles).
- focus_for_tomorrow: up to 3 carry-over tasks or next steps.
- observations: up to 2 neutral notes (e.g. "Estimates ran long by ~30%").
- Return ONLY JSON matching the keys exactly.`;

export async function POST(req: Request) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json()) as Body;
  const date = body.date ?? new Date().toISOString().slice(0, 10);
  const dayStart = `${date}T00:00:00Z`;
  const dayEnd = `${date}T23:59:59Z`;

  const [{ data: tasks }, { data: sessions }] = await Promise.all([
    supa
      .from('tasks')
      .select('id, title, status, priority, estimated_seconds, total_time_seconds')
      .gte('updated_at', dayStart)
      .lte('updated_at', dayEnd),
    supa
      .from('tracked_sessions')
      .select('task_id, duration_seconds, started_at, ended_at')
      .gte('started_at', dayStart)
      .lte('started_at', dayEnd)
      .not('ended_at', 'is', null),
  ]);

  const completed = (tasks ?? []).filter((t) => t.status === 'done');
  const inProgress = (tasks ?? []).filter((t) => t.status === 'in_progress');
  const totalTrackedSeconds = (sessions ?? []).reduce(
    (sum, s) => sum + (s.duration_seconds ?? 0),
    0,
  );

  const stats = {
    date,
    completed_count: completed.length,
    in_progress_count: inProgress.length,
    total_tracked_minutes: Math.round(totalTrackedSeconds / 60),
    completed_tasks: completed.map((t) => ({
      title: t.title,
      estimated_minutes: t.estimated_seconds ? Math.round(t.estimated_seconds / 60) : null,
      actual_minutes: Math.round((t.total_time_seconds ?? 0) / 60),
    })),
    in_progress_tasks: inProgress.map((t) => ({
      title: t.title,
      priority: t.priority,
    })),
  };

  try {
    const { data } = await runAgent<AgentOutput>({
      userId: user.id,
      agent: 'daily_summary',
      system: SYSTEM,
      user: `Here is the day's activity as JSON:\n${JSON.stringify(stats, null, 2)}`,
      maxTokens: 700,
      requestPayload: stats,
    });

    return withCors(Response.json({
      headline: (data.headline ?? '').slice(0, 200),
      wins: (data.wins ?? []).slice(0, 3),
      focus_for_tomorrow: (data.focus_for_tomorrow ?? []).slice(0, 3),
      observations: (data.observations ?? []).slice(0, 2),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return withCors(Response.json({ error: message }, { status: 500 }));
  }
}
