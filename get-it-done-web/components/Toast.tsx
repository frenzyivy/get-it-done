'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';

const AUTO_DISMISS_MS = 3500;
// Phase 1.3 — edit-reset toast has its own 8-s window per the upgrade brief.
const ACTION_DISMISS_MS = 8000;

// Transient toast pinned bottom-right. B&W glass aesthetic — white-tinted
// translucent panel, subtle shadow, dark ink. Auto-dismisses after 3.5s
// (8s when the toast carries an Undo action); the `id`-scoped dismiss
// prevents an old timer from clearing a newer toast that took its place.
export function Toast() {
  const toast = useStore((s) => s.toast);
  const dismissToast = useStore((s) => s.dismissToast);
  const undoEditReset = useStore((s) => s.undoEditReset);

  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const ms = toast.action ? ACTION_DISMISS_MS : AUTO_DISMISS_MS;
    const handle = window.setTimeout(() => dismissToast(id), ms);
    return () => window.clearTimeout(handle);
  }, [toast, dismissToast]);

  if (!toast) return null;

  const handleAction = () => {
    if (!toast.action) return;
    if (toast.action.kind === 'edit_reset_undo') {
      void undoEditReset(toast.action.taskId, toast.action.previousStatus);
    }
  };

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
      <div className="flex items-center gap-3">
        <span className="flex-1">{toast.message.replace(/ — undo$/, '')}</span>
        {toast.action && (
          <button
            type="button"
            onClick={handleAction}
            className="text-[12px] font-bold text-[#1a1a2e] cursor-pointer bg-transparent border-[1.5px] border-[#1a1a2e] rounded-md px-2 py-[3px] hover:bg-[#1a1a2e] hover:text-white transition-colors"
          >
            Undo
          </button>
        )}
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
