import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST() {
  const supa = await supabaseServer();
  const { data: auth, error: authErr } = await supa.auth.getUser();
  if (authErr || !auth.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabaseAdmin()
    .from('notifications')
    .insert({
      user_id: auth.user.id,
      kind: 'test',
      title: 'Test notification',
      body: 'If you see this, your Realtime + fan-out pipeline works.',
      data: { source: 'settings_test_button' },
    });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
