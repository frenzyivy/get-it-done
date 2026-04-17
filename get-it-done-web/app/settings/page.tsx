import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { Settings } from '@/components/Settings';
import { SettingsInit } from '@/components/SettingsInit';

export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return (
    <>
      <SettingsInit userId={user.id} />
      <Settings />
    </>
  );
}
