import { supabase } from './supabase';
import type { InsightsPayload, InsightsRange } from '@/types';

function webBase(): string {
  const base = process.env.EXPO_PUBLIC_WEB_URL;
  if (!base) {
    throw new Error(
      'EXPO_PUBLIC_WEB_URL is not set. Point it at the deployed Next.js app.',
    );
  }
  return base.replace(/\/$/, '');
}

export async function fetchInsights(range: InsightsRange): Promise<InsightsPayload> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(
    `${webBase()}/api/insights?range=${encodeURIComponent(range)}`,
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

// Phase 7 step E2 — calls the same /api/insights/streak-history endpoint the
// web Daily Progress tab uses. Single-source the streak replay rule on the
// server so mobile and web can't diverge as the rule evolves.
export interface StreakHistoryPayload {
  window_days: number;
  timezone: string;
  today: string;
  peak_value: number;
  peak_date: string | null;
  days: { date: string; streak: number; qualified: boolean }[];
}

export async function fetchStreakHistory(): Promise<StreakHistoryPayload> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${webBase()}/api/insights/streak-history`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`streak-history ${res.status}: ${text}`);
  }
  return (await res.json()) as StreakHistoryPayload;
}
