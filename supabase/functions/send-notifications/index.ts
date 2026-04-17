// send-notifications
// Drains the notifications outbox: anything with push_sent_at IS NULL or
// email_sent_at IS NULL gets fanned out to the appropriate channel, then
// stamped so the next run ignores it.
//
// In-app notifications need no push here — Supabase Realtime broadcasts on
// INSERT and clients with a subscription pick them up automatically.

import { preflight, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendExpoPush } from '../_shared/expo-push.ts';
import { sendEmail } from '../_shared/resend.ts';
import type { UserPreferences } from '../_shared/types.ts';

const BATCH_SIZE = 100;

interface NotificationRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  push_sent_at: string | null;
  email_sent_at: string | null;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const supabase = adminClient();

  // Grab recent unsent rows. 24h cap stops us retrying forever on a row
  // that's been failing to send.
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: rows } = await supabase
    .from('notifications')
    .select('id, user_id, kind, title, body, data, push_sent_at, email_sent_at')
    .gte('created_at', since)
    .or('push_sent_at.is.null,email_sent_at.is.null')
    .limit(BATCH_SIZE);

  const notifications = (rows ?? []) as NotificationRow[];
  if (notifications.length === 0) return json({ pushed: 0, emailed: 0 });

  // Fetch auth emails + preferences in bulk so we issue one query per user_id.
  const userIds = Array.from(new Set(notifications.map((n) => n.user_id)));
  const { data: prefsData } = await supabase
    .from('user_preferences')
    .select('user_id, notify_push, notify_email, expo_push_token')
    .in('user_id', userIds);
  const prefsMap = new Map<string, UserPreferences>();
  for (const p of (prefsData ?? []) as UserPreferences[]) prefsMap.set(p.user_id, p);

  // Auth emails come from auth.users — service role can read.
  const emailByUser = new Map<string, string>();
  for (const uid of userIds) {
    const { data } = await supabase.auth.admin.getUserById(uid);
    if (data.user?.email) emailByUser.set(uid, data.user.email);
  }

  const pushMessages: {
    to: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    sound: 'default';
    notifId: string;
  }[] = [];
  const emailJobs: { notifId: string; userId: string }[] = [];

  for (const n of notifications) {
    const prefs = prefsMap.get(n.user_id);
    if (!prefs) continue;

    if (!n.push_sent_at && prefs.notify_push && prefs.expo_push_token) {
      pushMessages.push({
        to: prefs.expo_push_token,
        title: n.title,
        body: n.body ?? '',
        data: { ...n.data, notification_id: n.id },
        sound: 'default',
        notifId: n.id,
      });
    }

    if (!n.email_sent_at && prefs.notify_email) {
      emailJobs.push({ notifId: n.id, userId: n.user_id });
    }
  }

  // Push fan-out
  if (pushMessages.length > 0) {
    await sendExpoPush(pushMessages);
    await supabase
      .from('notifications')
      .update({ push_sent_at: new Date().toISOString() })
      .in('id', pushMessages.map((m) => m.notifId));
  }

  // Email fan-out — one HTTP call per recipient since Resend doesn't batch
  // cross-user sends cleanly.
  let emailed = 0;
  for (const job of emailJobs) {
    const to = emailByUser.get(job.userId);
    if (!to) continue;
    const notif = notifications.find((n) => n.id === job.notifId);
    if (!notif) continue;

    await sendEmail({
      to,
      subject: notif.title,
      html: `<div style="font-family:system-ui,sans-serif"><h2>${notif.title}</h2><p>${
        notif.body ?? ''
      }</p><p style="color:#888;font-size:12px">Sent by Get-it-done</p></div>`,
    });
    await supabase
      .from('notifications')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', job.notifId);
    emailed += 1;
  }

  return json({ pushed: pushMessages.length, emailed });
});
