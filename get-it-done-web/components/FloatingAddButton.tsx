'use client';

import { useState } from 'react';
import { AddTaskForm } from './AddTaskForm';

export function FloatingAddButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Add task"
        title="Add task"
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
