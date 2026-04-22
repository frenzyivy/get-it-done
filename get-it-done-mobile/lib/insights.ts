import { supabase } from './supabase';
import type { InsightsPayload, InsightsRange } from '@/types';

export async function fetchInsights(range: InsightsRange): Promise<InsightsPayload> {
  const base = process.env.EXPO_PUBLIC_WEB_URL;
  if (!base) {
    throw new Error(
      'EXPO_PUBLIC_WEB_URL is not set. Point it at the deployed Next.js app.',
    );
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(
    `${base.replace(/\/$/, '')}/api/insights?range=${encodeURIComponent(range)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`insights ${res.status}: ${text}`);
  }
  return (await res.json()) as InsightsPayload;
}
