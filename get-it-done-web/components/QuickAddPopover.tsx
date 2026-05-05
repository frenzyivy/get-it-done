'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';

// Feature 13 — Hover Quick-Add Popover. Anchored to the cell's `+` button
// rect; portaled to <body> so the grid's overflow:hidden doesn't clip it.
// Vertical flip is computed from geometry, not row index, so it stays correct
// if header height or cell height changes.

const INBOX_PROJECT_NAME = 'Inbox';
const INBOX_COLOR = '#9ca3af'; // matches QuickAddBar's lazy-create color
const POPOVER_WIDTH = 280;
const VIEWPORT_PADDING = 8;

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Props {
  cellDate: Date;
  anchorRect: AnchorRect;
  onClose: () => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidHHMM(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

function dayLong(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function dayMonoUpper(d: Date): string {
  return d
    .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();
}

export function QuickAddPopover({ cellDate, anchorRect, onClose }: Props) {
  const addTask = useStore((s) => s.addTask);
  const addProject = useStore((s) => s.addProject);
  const addPlannedBlock = useStore((s) => s.addPlannedBlock);
  const projects = useStore((s) => s.projects);
  const showToast = useStore((s) => s.showToast);

  const [name, setName] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position the popover relative to the anchor. Recomputes after first paint
  // (so we can measure popover height) and on viewport changes.
  const recomputePosition = useCallback(() => {
    const el = popoverRef.current;
    const h = el?.offsetHeight ?? 210;
    const w = POPOVER_WIDTH;

    // Vertical: prefer below; flip above if it would overflow.
    let top = anchorRect.bottom + 8;
    if (top + h + VIEWPORT_PADDING > window.innerHeight) {
      top = anchorRect.top - h - 8;
    }
    // Final clamp so we don't go off the top either.
    top = Math.max(VIEWPORT_PADDING, top);

    // Horizontal: right-align to the cell so the popover hangs left from
    // the `+` button (button sits top-right of cell). Flip if it would
    // overflow the left edge, then clamp to viewport.
    let left = anchorRect.right - w;
    if (left < VIEWPORT_PADDING) {
      left = anchorRect.left;
    }
    left = Math.max(
      VIEWPORT_PADDING,
      Math.min(left, window.innerWidth - w - VIEWPORT_PADDING),
    );

    setPos({ top, left });
  }, [anchorRect]);

  useLayoutEffect(() => {
    recomputePosition();
  }, [recomputePosition]);

  useEffect(() => {
    let raf = 0;
    const onScrollOrResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        recomputePosition();
      });
    };
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [recomputePosition]);

  // Autofocus the name input.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Click-outside closes. Capture phase so we beat any in-popover handlers.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = popoverRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Task name required');
      return;
    }
    if (!isValidHHMM(start) || !isValidHHMM(end)) {
      setError('Invalid time format');
      return;
    }
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startAt = new Date(
      cellDate.getFullYear(),
      cellDate.getMonth(),
      cellDate.getDate(),
      sh,
      sm,
      0,
      0,
    );
    const endAt = new Date(
      cellDate.getFullYear(),
      cellDate.getMonth(),
      cellDate.getDate(),
      eh,
      em,
      0,
      0,
    );
    const durationSec = Math.round((endAt.getTime() - startAt.getTime()) / 1000);
    if (durationSec <= 0) {
      setError('End must be after start');
      return;
    }

    setSaving(true);
    try {
      // Inbox lazy-create — same convention as QuickAddBar so orphan tasks
      // always have a project home.
      let inbox = projects.find(
        (p) => p.name.toLowerCase() === INBOX_PROJECT_NAME.toLowerCase(),
      );
      if (!inbox) {
        inbox = (await addProject(INBOX_PROJECT_NAME, INBOX_COLOR, 'active')) ?? undefined;
      }
      const projectIds = inbox ? [inbox.id] : [];

      const taskId = await addTask({
        title: trimmed,
        priority: 'medium',
        tag_ids: [],
        category_ids: [],
        project_ids: projectIds,
        due_date: null,
        status: 'todo',
        estimated_seconds: null,
      });
      if (!taskId) {
        setError("Couldn't create task");
        setSaving(false);
        return;
      }

      await addPlannedBlock({
        task_id: taskId,
        subtask_id: null,
        start_at: startAt.toISOString(),
        duration_seconds: durationSec,
        block_type: 'work',
        notes: null,
      });

      showToast(`Added "${trimmed}" to ${dayLong(cellDate)}`);
      onClose();
    } catch {
      setError("Couldn't add task");
      setSaving(false);
    }
  }, [
    saving,
    name,
    start,
    end,
    cellDate,
    projects,
    addProject,
    addTask,
    addPlannedBlock,
    showToast,
    onClose,
  ]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSave();
  };

  const node = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Quick add task"
      className="fixed z-[120] rounded-[12px] bg-white"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: POPOVER_WIDTH,
        boxShadow: '0 10px 30px rgba(0,0,0,0.18), 0 0 0 1px #e5e7eb',
        visibility: pos ? 'visible' : 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <form onSubmit={onSubmit}>
        <div className="flex items-start justify-between px-3 pt-2.5 pb-1">
          <div className="text-[12px] font-extrabold text-[#1a1a2e]">Quick add</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[14px] leading-none text-[#9ca3af] hover:text-[#1a1a2e] bg-transparent border-0 cursor-pointer px-1"
          >
            ×
          </button>
        </div>
        <div className="px-3 text-[10px] font-mono uppercase tracking-[1px] text-[#9ca3af]">
          {dayMonoUpper(cellDate)}
        </div>

        <div className="px-3 pt-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Task name..."
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            className="w-full text-[13px] px-2 py-1.5 border border-[#e5e7eb] rounded-md text-[#1a1a2e] bg-white focus:outline-none focus:border-[#a78bfa]"
          />
        </div>

        <div className="px-3 pt-2 flex items-center gap-2">
          <input
            type="time"
            step={900}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (error) setError(null);
            }}
            className="flex-1 text-[12px] px-2 py-1 border border-[#e5e7eb] rounded-md tabular-nums bg-white text-[#1a1a2e]"
          />
          <span className="text-[12px] text-[#888]">–</span>
          <input
            type="time"
            step={900}
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              if (error) setError(null);
            }}
            className="flex-1 text-[12px] px-2 py-1 border border-[#e5e7eb] rounded-md tabular-nums bg-white text-[#1a1a2e]"
          />
        </div>

        {error && (
          <div className="px-3 pt-1.5 text-[11px] text-[#dc2626]">{error}</div>
        )}

        <div className="px-3 py-2.5 mt-2 border-t border-[#eee] flex items-center justify-end gap-2 bg-[#fafafa] rounded-b-[12px]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-transparent border-0 text-[#666] text-[12px] font-bold cursor-pointer hover:bg-black/[.04]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1.5 rounded-md bg-[#1a1a2e] text-white border-0 text-[12px] font-bold cursor-pointer"
            style={{ opacity: saving ? 0.5 : 1 }}
          >
            {saving ? 'Adding…' : 'Add task'}
          </button>
        </div>
      </form>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
