import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase-server';

// CORS — same shape as app/api/ai/_cors.ts but exposes the wider set of verbs
// the label routes use (attach/detach calls DELETE and PATCH too).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
} as const;

export function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Resolves the current user from either the cookie session (browser) or an
 * Authorization: Bearer header (mobile). Returns a Supabase client bound to
 * that user so subsequent RLS-gated queries still run as them.
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

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function serverError(message: string): Response {
  return Response.json({ error: message }, { status: 500 });
}
