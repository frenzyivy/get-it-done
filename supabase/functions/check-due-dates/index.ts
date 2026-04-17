// check-due-dates
// Scans non-done tasks with due_dates and queues notifications:
//   - 'due_soon'  when due_date falls within the rule's hours_before window
//   - 'overdue'   when due_date has passed
// Fires once per task per condition (tracked via a `kind` lookup against the
// notifications outbox) so the user isn't spammed every hour.

import { preflight, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import type { AutomationRule, TaskRow } from '../_shared/types.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const supabase = adminClient();

  // Pull all relevant rules in one shot, grouped by user.
  const { data: rules } = await supabase
    .from('automation_rules')
    .select('user_id, rule_key, is_enabled, config')
    .in('rule_key', ['due_soon', 'overdue']);

  const byUser = new Map<string, { dueSoon: AutomationRule | null; overdue: AutomationRule | null }>();
  for (const r of (rules ?? []) as AutomationRule[]) {
    const entry = byUser.get(r.user_id) ?? { dueSoon: null, overdue: null };
    if (r.rule_key === 'due_soon') entry.dueSoon = r;
    if (r.rule_key === 'overdue') entry.overdue = r;
    byUser.set(r.user_id, entry);
  }

  // Only candidate tasks: status != 'done' and has a due_date.
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, user_id, title, status, priority, due_date, created_at, updated_at, total_time_seconds')
    .neq('status', 'done')
    .not('due_date', 'is', null);

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  let queued = 0;

  for (const task of (tasks ?? []) as TaskRow[]) {
    const rules = byUser.get(task.user_id);
    if (!rules) continue;

    const dueDate = new Date(task.due_date as string);
    const hoursUntilDue = (dueDate.getTime() - now.getTime()) / 3_600_000;

    // Helper: only notify if we haven't already sent this kind for this task.
    const alreadyNotified = async (kind: string) => {
      const { data } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', task.user_id)
        .eq('kind', kind)
        .filter('data->>task_id', 'eq', task.id)
        .limit(1)
        .maybeSingle();
      return Boolean(data);
    };

    // OVERDUE
    if (rules.overdue?.is_enabled && hoursUntilDue < 0) {
      if (!(await alreadyNotified('overdue'))) {
        await supabase.from('notifications').insert({
          user_id: task.user_id,
          kind: 'overdue',
          title: `Overdue: ${task.title}`,
          body: `Was due ${task.due_date}. Let's knock it out.`,
          data: { task_id: task.id, deep_link: `/tasks/${task.id}` },
        });
        queued += 1;
      }
      continue;
    }

    // DUE SOON
    if (rules.dueSoon?.is_enabled) {
      const window = Number((rules.dueSoon.config as { hours_before?: number }).hours_before ?? 24);
      if (hoursUntilDue >= 0 && hoursUntilDue <= window) {
        if (!(await alreadyNotified('due_soon'))) {
          await supabase.from('notifications').insert({
            user_id: task.user_id,
            kind: 'due_soon',
            title: `Due soon: ${task.title}`,
            body: `Due ${task.due_date}.`,
            data: { task_id: task.id, deep_link: `/tasks/${task.id}` },
          });
          queued += 1;
        }
      }
    }
  }

  return json({ queued, checked_at: todayIso });
});
