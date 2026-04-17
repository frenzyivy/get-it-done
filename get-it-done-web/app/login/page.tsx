'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async () => {
    setErr(null);
    setLoading(true);
    const db = supabase();
    const { error } =
      mode === 'signin'
        ? await db.auth.signInWithPassword({ email, password })
        : await db.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.replace('/dashboard');
  };

  const handleGoogle = async () => {
    const db = supabase();
    await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background:
          'linear-gradient(145deg, #f8f7ff 0%, #f0f4ff 50%, #faf5ff 100%)',
      }}
    >
      <div className="w-full max-w-sm bg-white rounded-[18px] p-8 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <div className="text-center mb-6">
          <h1 className="text-[26px] font-extrabold text-[#1a1a2e] tracking-[-0.5px]">
            <span className="text-[#8b5cf6]">⚡</span> Get-it-done
          </h1>
          <p className="text-[13px] text-[#888] mt-1">
            Track tasks. Time work. Get it done.
          </p>
        </div>

        <button
          onClick={handleGoogle}
          className="w-full py-[10px] border-[1.5px] border-[#e5e7eb] rounded-[10px] bg-white text-sm font-semibold cursor-pointer hover:bg-black/[.02] transition-colors"
        >
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-4 text-[11px] text-[#aaa] uppercase tracking-[1px]">
          <div className="flex-1 h-px bg-[#eee]" />
          or
          <div className="flex-1 h-px bg-[#eee]" />
        </div>

        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-[10px] rounded-[10px] border-[1.5px] border-[#e5e7eb] text-sm outline-none focus:border-[#8b5cf6]"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
            placeholder="Password"
            className="w-full px-3 py-[10px] rounded-[10px] border-[1.5px] border-[#e5e7eb] text-sm outline-none focus:border-[#8b5cf6]"
          />
          {err && <p className="text-xs text-[#dc2626]">{err}</p>}
          <button
            onClick={handleEmailAuth}
            disabled={loading || !email || !password}
            className="w-full py-[10px] rounded-[10px] bg-[#8b5cf6] text-white font-bold text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </div>

        <button
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="w-full mt-4 text-xs text-[#888] hover:text-[#8b5cf6] bg-transparent border-0 cursor-pointer"
        >
          {mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
