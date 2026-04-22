import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { Insights } from '@/components/Insights';
import { InsightsInit } from '@/components/InsightsInit';

export default async function InsightsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return (
    <>
      <InsightsInit userId={user.id} />
      <Insights />
    </>
  );
}
