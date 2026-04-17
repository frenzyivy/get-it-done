// create-recurring-tasks
// Reads recurring_templates and materializes a new task row for each one
// that's due. Runs every 15 min via pg_cron.
//
// Invariants:
//   - Templates are NEVER modified (only `last_materialized_at` is bumped).
//   - Idempotent: comparing `last_materialized_at` against the current cycle
//     start guarantees we don't double-create if cron fires twice.

import { preflight, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import type { RecurringTemplate, UserPreferences } from '../_shared/types.ts';

function isDue(
  tpl: RecurringTemplate,
  now: Date,
  tz: string,
): boolean {
  // We only care about the local-time view; build a "YYYY-MM-DD HH" key.
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const currentHour = local.getHours();
  if (currentHour < tpl.hour_local) return false;

  // Has this cycle already been materialized?
  const lastIso = tpl.last_materialized_at;
  const cycleStart = cycleStartFor(tpl, local);
  if (lastIso && new Date(lastIso) >= cycleStart) return false;

  switch (tpl.frequency) {
    case 'daily':
      return true;
    case 'weekdays': {
      const d = local.getDay();
      return d >= 1 && d <= 5;
    }
    case 'weekly':
      return tpl.day_of_week === local.getDay();
    case 'monthly':
      return tpl.day_of_month === local.getDate();
  }
}

function cycleStartFor(tpl: RecurringTemplate, local: Date): Date {
  // Boundary we compare `last_materialized_at` against — start of current
  // day/week/month at the template's configured hour.
  const start = new Date(local);
  start.setHours(tpl.hour_local, 0, 0, 0);
  if (tpl.frequency === 'weekly' && tpl.day_of_week !== null) {
    const diff = (local.getDay() - tpl.day_of_week + 7) % 7;
    start.setDate(start.getDate() - diff);
  } else if (tpl.frequency === 'monthly') {
    start.setDate(tpl.day_of_month ?? 1);
  }
  return start;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const supabase = adminClient();

  const { data: templates, error } = await supabase
    .from('recurring_templates')
    .select('*')
    .eq('is_enabled', true);
  if (error) return json({ error: error.message }, 500);

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('user_id, timezone');
  const tzByUser = new Map<string, string>(
    (prefs as Pick<UserPreferences, 'user_id' | 'timezone'>[] | null)?.map(
      (p) => [p.user_id, p.timezone],
    ) ?? [],
  );

  const now = new Date();
  let created = 0;

  for (const tpl of (templates ?? []) as RecurringTemplate[]) {
    const tz = tzByUser.get(tpl.user_id) ?? 'UTC';
    if (!isDue(tpl, now, tz)) continue;

    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .insert({
        user_id: tpl.user_id,
        title: tpl.title,
        priority: tpl.priority,
        status: 'todo',
        recurring_template_id: tpl.id,
      })
      .select()
      .single();
    if (taskErr) {
      console.error('task insert failed', tpl.id, taskErr);
      continue;
    }

    if (tpl.tag_ids.length > 0) {
      await supabase
        .from('task_tags')
        .insert(tpl.tag_ids.map((tag_id) => ({ task_id: task.id, tag_id })));
    }

    if (tpl.subtask_titles.length > 0) {
      await supabase.from('subtasks').insert(
        tpl.subtask_titles.map((title, idx) => ({
          task_id: task.id,
          title,
          sort_order: idx,
        })),
      );
    }

    await supabase
      .from('recurring_templates')
      .update({ last_materialized_at: now.toISOString() })
      .eq('id', tpl.id);

    await supabase.from('notifications').insert({
      user_id: tpl.user_id,
      kind: 'recurring_created',
      title: 'New recurring task',
      body: tpl.title,
      data: { task_id: task.id, template_id: tpl.id },
    });

    created += 1;
  }

  return json({ created });
});
