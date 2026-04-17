// daily-summary
// Runs hourly. For each user whose daily_summary_enabled = true AND whose
// local hour matches daily_summary_hour, generates a Claude-powered recap of
// yesterday and priorities for today, then inserts a notification.
//
// We dedupe by date (one summary per user per local day) via the data->>day
// field in the notifications table.

import { preflight, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import type { UserPreferences } from '../_shared/types.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

interface TaskSnap {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  total_time_seconds: number;
  updated_at: string;
}

const SYSTEM_PROMPT = `You write warm, concise morning briefings for a solo productivity app called Get-it-done.
Output a short markdown summary (60-120 words) with:
- one sentence recognizing what was completed yesterday,
- 1-3 top priorities for today (prefer urgent/high + overdue),
- one encouraging closing line.
No lists of every task. No preamble. Start with the greeting.`;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500);

  const supabase = adminClient();
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const { data: prefsList } = await supabase
    .from('user_preferences')
    .select('user_id, timezone, daily_summary_enabled, daily_summary_hour, notify_in_app, notify_push, notify_email, expo_push_token')
    .eq('daily_summary_enabled', true);

  const now = new Date();
  let created = 0;

  for (const prefs of (prefsList ?? []) as UserPreferences[]) {
    const tz = prefs.timezone || 'UTC';
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    if (local.getHours() !== prefs.daily_summary_hour) continue;

    const today = local.toISOString().slice(0, 10);

    // Skip if we've already sent today's summary.
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', prefs.user_id)
      .eq('kind', 'daily_summary')
      .filter('data->>day', 'eq', today)
      .limit(1)
      .maybeSingle();
    if (existing) continue;

    const yesterdayStart = new Date(local);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, status, priority, due_date, total_time_seconds, updated_at')
      .eq('user_id', prefs.user_id);

    const taskList = (tasks ?? []) as TaskSnap[];
    const completedYesterday = taskList.filter(
      (t) =>
        t.status === 'done' &&
        new Date(t.updated_at) >= yesterdayStart &&
        new Date(t.updated_at) < local,
    );
    const openTasks = taskList.filter((t) => t.status !== 'done');
    const todayPriorities = openTasks
      .sort(
        (a, b) =>
          orderFor(b.priority) - orderFor(a.priority) ||
          dueScore(a.due_date) - dueScore(b.due_date),
      )
      .slice(0, 5);

    const userMsg = `Completed yesterday (${completedYesterday.length}):
${completedYesterday.map((t) => `- ${t.title}`).join('\n') || '(nothing)'}

Top open tasks:
${todayPriorities
  .map(
    (t) =>
      `- [${t.priority}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}`,
  )
  .join('\n') || '(none)'}`;

    let summary = '';
    try {
      const resp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      });
      const block = resp.content[0];
      summary = block.type === 'text' ? block.text : '';

      await supabase.from('ai_logs').insert({
        user_id: prefs.user_id,
        endpoint: 'daily-summary',
        input_tokens: resp.usage.input_tokens,
        output_tokens: resp.usage.output_tokens,
      }).throwOnError().select().then(() => {}).catch(() => {
        // ai_logs table may not exist yet (Phase 4) — non-fatal.
      });
    } catch (err) {
      console.error('Claude call failed', err);
      summary = 'Here is your morning briefing.';
    }

    await supabase.from('notifications').insert({
      user_id: prefs.user_id,
      kind: 'daily_summary',
      title: 'Your morning briefing',
      body: summary,
      data: { day: today, completed: completedYesterday.length, open: openTasks.length },
    });
    created += 1;
  }

  return json({ created });
});

function orderFor(p: TaskSnap['priority']): number {
  return { urgent: 3, high: 2, medium: 1, low: 0 }[p];
}

function dueScore(due: string | null): number {
  if (!due) return Number.POSITIVE_INFINITY;
  return new Date(due).getTime();
}
