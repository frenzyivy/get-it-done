'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';

const AUTO_DISMISS_MS = 3500;

// Transient toast pinned bottom-right. B&W glass aesthetic — white-tinted
// translucent panel, subtle shadow, dark ink. Auto-dismisses after 3.5s; the
// `id`-scoped dismiss prevents an old timer from clearing a newer toast that
// took its place.
export function Toast() {
  const toast = useStore((s) => s.toast);
  const dismissToast = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const handle = window.setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(handle);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] max-w-[360px]"
      style={{
        background: 'rgba(255,255,255,0.96)',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow:
          '0 8px 30px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
        borderRadius: 12,
        padding: '10px 14px',
        color: '#1a1a2e',
        fontSize: 13,
        lineHeight: 1.4,
        backdropFilter: 'blur(8px)',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="flex-1">{toast.message}</span>
        <button
          onClick={() => dismissToast()}
          className="text-[#9ca3af] bg-transparent border-0 cursor-pointer text-base leading-none mt-[1px] hover:text-[#1a1a2e]"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
