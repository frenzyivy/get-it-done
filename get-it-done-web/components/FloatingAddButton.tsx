'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { AddTaskForm } from './AddTaskForm';

// Long-press (or right-click / shift+click) opens the Focus Lock picker for
// the most sensible current task. Parity with mobile's FAB context menu.

const LONG_PRESS_MS = 450;

export function FloatingAddButton() {
  const [open, setOpen] = useState(false);
  const tasks = useStore((s) => s.tasks);
  const openFocusLockPicker = useStore((s) => s.openFocusLockPicker);

  const pressTimer = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const pickFocusTarget = (): string | null => {
    const today = new Date().toISOString().slice(0, 10);
    const pick =
      tasks.find((t) => t.planned_for_date === today && t.status !== 'done') ??
      tasks.find((t) => t.status === 'in_progress') ??
      tasks.find((t) => t.status === 'todo');
    return pick?.id ?? null;
  };

  const triggerFocusLock = () => {
    const taskId = pickFocusTarget();
    if (taskId) openFocusLockPicker(taskId);
  };

  const handlePointerDown = () => {
    longPressedRef.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressedRef.current = true;
      triggerFocusLock();
    }, LONG_PRESS_MS);
  };

  const clearPressTimer = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    clearPressTimer();
    if (longPressedRef.current) {
      // Long-press already fired; swallow the click.
      e.preventDefault();
      return;
    }
    if (e.shiftKey) {
      triggerFocusLock();
      return;
    }
    setOpen(true);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    triggerFocusLock();
  };

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerUp={clearPressTimer}
        onPointerLeave={clearPressTimer}
        onPointerCancel={clearPressTimer}
        aria-label="Add task (long-press or right-click to start a focus session)"
        title="Tap: add task · Long-press / right-click: start focus session"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-[#8b5cf6] text-white text-3xl font-light flex items-center justify-center shadow-[0_8px_20px_rgba(139,92,246,0.45)] hover:bg-[#7c3aed] active:scale-95 transition-all"
      >
        +
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-24 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[560px]"
            onClick={(e) => e.stopPropagation()}
          >
            <AddTaskForm
              defaultStatus="todo"
              forceOpen
              hideTrigger
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
