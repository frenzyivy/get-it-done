'use client';

import { useStore } from '@/lib/store';

// Phase 1.1 — small chip-style toggle that lives in the view-switcher row of
// the Dashboard. Hidden is the default; clicking flips to "show completed"
// which makes done tasks render dimmed with strikethrough in every list view.
export function HideCompletedToggle() {
  const showCompleted = useStore((s) => s.showCompleted);
  const setShowCompleted = useStore((s) => s.setShowCompleted);

  return (
    <button
      type="button"
      onClick={() => setShowCompleted(!showCompleted)}
      className="text-[11px] font-semibold px-3 py-[6px] rounded-lg border-[1.5px] cursor-pointer transition-colors flex items-center gap-2"
      style={{
        borderColor: showCompleted ? '#1a1a2e' : '#e5e7eb',
        background: showCompleted ? '#1a1a2e' : 'white',
        color: showCompleted ? '#fff' : '#666',
      }}
      title={
        showCompleted
          ? 'Hide completed tasks'
          : 'Show completed tasks (dimmed)'
      }
      aria-pressed={showCompleted}
    >
      <span
        aria-hidden
        className="inline-block w-3 h-3 rounded-[3px] flex items-center justify-center text-[10px]"
        style={{
          background: showCompleted ? '#fff' : 'transparent',
          color: showCompleted ? '#1a1a2e' : '#888',
          border: showCompleted ? 'none' : '1.5px solid #c7c9d1',
        }}
      >
        {showCompleted ? '✓' : ''}
      </span>
      {showCompleted ? 'Showing completed' : 'Hide completed'}
    </button>
  );
}
