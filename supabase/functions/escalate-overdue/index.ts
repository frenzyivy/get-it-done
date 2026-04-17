// escalate-overdue
// Bumps priority on tasks that have been overdue for more than the rule's
// `bump_after_hours` threshold.
//
// PLAN invariant: only priority changes. Never deletes or auto-completes.

import { preflight, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import type { AutomationRule, TaskRow } from '../_shared/types.ts';

const BUMP: Record<TaskRow['priority'], TaskRow['priority']> = {
  low: 'medium',
  medium: 'high',
  high: 'urgent',
  urgent: 'urgent', // already maxed
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const supabase = adminClient();

  const { data: rules } = await supabase
    .from('automation_rules')
    .select('user_id, rule_key, is_enabled, config')
    .eq('rule_key', 'overdue_escalate')
    .eq('is_enabled', true);

  if (!rules || rules.length === 0) return json({ escalated: 0 });

  const thresholdByUser = new Map<string, number>();
  for (const r of rules as AutomationRule[]) {
    const hours = Number((r.config as { bump_after_hours?: number }).bump_after_hours ?? 48);
    thresholdByUser.set(r.user_id, hours);
  }

  const userIds = Array.from(thresholdByUser.keys());
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, user_id, title, status, priority, due_date, created_at, updated_at, total_time_seconds')
    .in('user_id', userIds)
    .neq('status', 'done')
    .neq('priority', 'urgent')
    .not('due_date', 'is', null);

  const now = new Date();
  let escalated = 0;

  for (const task of (tasks ?? []) as TaskRow[]) {
    const threshold = thresholdByUser.get(task.user_id);
    if (!threshold) continue;

    const hoursOverdue =
      (now.getTime() - new Date(task.due_date as string).getTime()) / 3_600_000;
    if (hoursOverdue < threshold) continue;

    const next = BUMP[task.priority];
    if (next === task.priority) continue;

    await supabase.from('tasks').update({ priority: next }).eq('id', task.id);
    await supabase.from('notifications').insert({
      user_id: task.user_id,
      kind: 'priority_bumped',
      title: 'Priority bumped',
      body: `"${task.title}" is now ${next.toUpperCase()} — it's been overdue for a while.`,
      data: { task_id: task.id, from: task.priority, to: next },
    });
    escalated += 1;
  }

  return json({ escalated });
});
