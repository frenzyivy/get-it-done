'use client';

import { useMemo } from 'react';
import type { SavedView, ViewMode } from '@/types';

export interface QuickAction {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
}

export interface QuickAddActionsProps {
  selectedIndex: number;
  onSelectedIndexChange: (idx: number) => void;
  onActivate: (action: QuickAction) => void;
  // Inputs needed to build the action list
  view: ViewMode;
  setView: (next: ViewMode) => void;
  savedViews: SavedView[];
  loadView: (id: string) => void;
  focusInput: () => void;
}

// Order matches the dashboard's view switcher (Dashboard.tsx:120-126).
const VIEW_CYCLE: ViewMode[] = [
  'today',
  'matrix',
  'kanban',
  'list',
  'priority',
  'schedule',
  'timeline',
  'calendar',
];

const VIEW_LABELS: Record<ViewMode, string> = {
  today: 'Today',
  matrix: 'Matrix',
  kanban: 'Board',
  list: 'List',
  priority: 'Priority',
  schedule: 'Schedule',
  timeline: 'Timeline',
  calendar: 'Calendar',
};

function nextView(current: ViewMode): ViewMode {
  const idx = VIEW_CYCLE.indexOf(current);
  return VIEW_CYCLE[(idx + 1) % VIEW_CYCLE.length];
}

export function buildQuickActions(args: {
  view: ViewMode;
  setView: (next: ViewMode) => void;
  savedViews: SavedView[];
  loadView: (id: string) => void;
  focusInput: () => void;
}): QuickAction[] {
  const { view, setView, savedViews, loadView, focusInput } = args;

  // Most-recently-updated saved view is the closest available proxy for
  // "last used" — there's no last_used_at column. Sort defensively.
  const lastSavedView = savedViews.length
    ? [...savedViews].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
    : null;

  const upcoming = nextView(view);

  return [
    {
      id: 'add-task',
      label: 'Add task',
      hint: 'Just start typing',
      run: () => focusInput(),
    },
    {
      id: 'switch-view',
      label: 'Switch view',
      hint: `${VIEW_LABELS[view]} → ${VIEW_LABELS[upcoming]}`,
      run: () => setView(upcoming),
    },
    {
      id: 'toggle-break',
      label: 'Toggle break',
      hint: 'Coming soon',
      disabled: true,
      run: () => {
        /* not wired — see plan */
      },
    },
    {
      id: 'open-last-saved-view',
      label: 'Open last saved view',
      hint: lastSavedView ? lastSavedView.name : 'No saved views yet',
      disabled: !lastSavedView,
      run: () => {
        if (lastSavedView) loadView(lastSavedView.id);
      },
    },
  ];
}

export function QuickAddActions({
  selectedIndex,
  onSelectedIndexChange,
  onActivate,
  view,
  setView,
  savedViews,
  loadView,
  focusInput,
}: QuickAddActionsProps) {
  const actions = useMemo(
    () => buildQuickActions({ view, setView, savedViews, loadView, focusInput }),
    [view, setView, savedViews, loadView, focusInput],
  );

  return (
    <div
      className="mt-3"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: 10,
      }}
      role="listbox"
      aria-label="Quick actions"
    >
      <div className="text-[10px] font-mono uppercase tracking-[1.5px] text-white/45 mb-2 px-1">
        Quick actions
      </div>
      {actions.map((a, idx) => {
        const isSel = idx === selectedIndex && !a.disabled;
        return (
          <div
            key={a.id}
            role="option"
            aria-selected={isSel}
            aria-disabled={a.disabled || undefined}
            onMouseEnter={() => {
              if (!a.disabled) onSelectedIndexChange(idx);
            }}
            onMouseDown={(e) => {
              if (a.disabled) return;
              e.preventDefault();
              onActivate(a);
            }}
            className="flex items-center gap-2 px-2 py-[6px] rounded-[8px] text-[13px]"
            style={{
              background: isSel ? 'rgba(255,255,255,0.10)' : 'transparent',
              color: a.disabled ? 'rgba(255,255,255,0.35)' : '#fff',
              cursor: a.disabled ? 'default' : 'pointer',
            }}
          >
            <span className="flex-1">{a.label}</span>
            {a.hint && (
              <span className="text-[11px] font-mono text-white/40">{a.hint}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
