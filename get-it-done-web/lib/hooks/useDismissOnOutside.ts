'use client';

import { useEffect, useRef } from 'react';

// Closes a popover when the user clicks outside its root or presses Escape.
// Attach the returned ref to the outermost container that includes BOTH the
// trigger button AND the popover panel — that way clicking the trigger to
// toggle doesn't immediately fire the outside handler.
//
// Uses `mousedown` (not `click`) so the popover dismisses before any inner
// click handlers fire on a nested element that's about to be re-rendered out.
export function useDismissOnOutside<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onClose: () => void,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const onMouseDown = (e: MouseEvent) => {
      const node = ref.current;
      if (!node) return;
      if (e.target instanceof Node && !node.contains(e.target)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, onClose]);

  return ref;
}
