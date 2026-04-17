import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { Dashboard } from '@/components/Dashboard';

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <Dashboard userId={user.id} />;
}
