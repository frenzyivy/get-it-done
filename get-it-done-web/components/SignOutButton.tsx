'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await supabase().auth.signOut();
        router.replace('/login');
        router.refresh();
      }}
      className="text-xs text-[#888] hover:text-[#dc2626] bg-transparent border-0 cursor-pointer font-semibold"
      title="Sign out"
    >
      Sign out
    </button>
  );
}
