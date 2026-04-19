import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Auth for /api/ai/* routes. Accepts two session sources:
 *   1. Next.js cookie session (browser)   — via @supabase/ssr
 *   2. Authorization: Bearer <access_token> (mobile/Expo)
 *
 * Returns a Supabase client bound to the authenticated user so subsequent
 * queries in the route still enforce RLS.
 */
export async function requireUser() {
  const header = await readAuthHeader();

  if (header) {
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${header}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await supa.auth.getUser(header);
    if (error || !data.user) {
      return { user: null, supa, error: unauthorized() } as const;
    }
    return { user: data.user, supa, error: null } as const;
  }

  const supa = await supabaseServer();
  const { data, error } = await supa.auth.getUser();
  if (error || !data.user) {
    return { user: null, supa, error: unauthorized() } as const;
  }
  return { user: data.user, supa, error: null } as const;
}

async function readAuthHeader(): Promise<string | null> {
  const { headers } = await import('next/headers');
  const list = await headers();
  const raw = list.get('authorization');
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1] : null;
}

function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
