'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { useDismissOnOutside } from '@/lib/hooks/useDismissOnOutside';
import { FilterPicker } from './FilterPicker';
import { TaskSearchInput } from './TaskSearchInput';
import type { Filters, SavedView, SavedViewType } from '@/types';

// Note: the saved-views dropdown deliberately lists *all* of the user's saved
// views regardless of view_type. Clicking one whose view_type differs from
// the current view will navigate to that view tab AND apply its filters in
// one action (per Decision #3). The view_type tag on each row hints what
// will happen.

// Filter bar (Change #4). Sits above BoardView/ListView. Renders one chip per
// active filter value (intersection across dims, union within a dim — the
// filtering happens in the views). Saved-views dropdown on the right; "Save
// view" is an inline name prompt that mirrors the typed-name delete pattern.

export function FilterBar() {
  const filters = useStore((s) => s.filters);
  const clearFilter = useStore((s) => s.clearFilter);
  const clearAllFilters = useStore((s) => s.clearAllFilters);
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
  const tags = useStore((s) => s.tags);
  const view = useStore((s) => s.view);
  const savedViews = useStore((s) => s.savedViews);
  const saveView = useStore((s) => s.saveView);
  const loadView = useStore((s) => s.loadView);
  const renameView = useStore((s) => s.renameView);
  const deleteView = useStore((s) => s.deleteView);
  const savedViewCounts = useStore((s) => s.savedViewCounts);
  const fetchSavedViewCounts = useStore((s) => s.fetchSavedViewCounts);

  // Spec maps web ViewMode → SavedViewType.view_type. 'kanban' is 'board' in
  // the DB schema (the `saved_views.view_type` CHECK constraint). Schedule
  // and timeline don't support saved views — the dropdown is hidden in those.
  const savedViewType: SavedViewType | null =
    view === 'kanban'
      ? 'board'
      : view === 'list'
        ? 'list'
        : view === 'priority'
          ? 'priority'
          : null;
  const supportsSavedViews = savedViewType !== null;

  const activeChips = useMemo(() => {
    const chips: { dim: keyof Filters; value: string; key: string; label: string }[] = [];
    for (const id of filters.project_ids) {
      const p = projects.find((x) => x.id === id);
      chips.push({
        dim: 'project_ids',
        value: id,
        key: 'PROJECT',
        label: p?.name ?? '(deleted)',
      });
    }
    for (const id of filters.category_ids) {
      const c = categories.find((x) => x.id === id);
      chips.push({
        dim: 'category_ids',
        value: id,
        key: 'CATEGORY',
        label: c?.name ?? '(deleted)',
      });
    }
    for (const id of filters.tag_ids) {
      const t = tags.find((x) => x.id === id);
      chips.push({
        dim: 'tag_ids',
        value: id,
        key: 'TAG',
        label: t?.name ?? '(deleted)',
      });
    }
    for (const p of filters.priorities) {
      chips.push({
        dim: 'priorities',
        value: p,
        key: 'PRIORITY',
        label: p[0].toUpperCase() + p.slice(1),
      });
    }
    return chips;
  }, [filters, projects, categories, tags]);

  const hasActiveFilters = activeChips.length > 0;

  // ---- Saved-views dropdown -----------------------------------------------
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const closeDropdown = useCallback(() => setDropdownOpen(false), []);
  const dropdownRef = useDismissOnOutside<HTMLDivElement>(dropdownOpen, closeDropdown);

  // Inline rename state — only one row in rename mode at a time.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const beginRename = (v: SavedView) => {
    setRenamingId(v.id);
    setRenameDraft(v.name);
  };
  const submitRename = async () => {
    if (!renamingId) return;
    const name = renameDraft.trim();
    if (!name) return;
    await renameView(renamingId, name);
    setRenamingId(null);
    setRenameDraft('');
  };

  // ---- Inline "Save view" -------------------------------------------------
  const [savingView, setSavingView] = useState(false);
  const [saveDraft, setSaveDraft] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);

  const submitSave = async () => {
    if (!savedViewType) return;
    const name = saveDraft.trim();
    if (!name || saveBusy) return;
    setSaveBusy(true);
    try {
      const created = await saveView(name, savedViewType, filters);
      if (created) {
        setSavingView(false);
        setSaveDraft('');
      }
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <div className="mb-3">
      <div className="flex items-start gap-2 flex-wrap">
        {/* Chip row (left). Wraps as needed; "+ Add filter" sits at the end. */}
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {activeChips.map((chip) => (
            <button
              key={`${chip.dim}:${chip.value}`}
              type="button"
              onClick={() => clearFilter(chip.dim, chip.value)}
              className="inline-flex items-center gap-2 px-3 py-[6px] rounded-full bg-[#1a1a2e] text-white text-[12px] font-medium cursor-pointer hover:bg-[#2a2a3e] transition-colors"
              aria-label={`Remove filter ${chip.key} ${chip.label}`}
            >
              <span className="text-[9px] font-mono uppercase tracking-wider opacity-70">
                {chip.key}
              </span>
              <span>{chip.label}</span>
              <span className="opacity-70 text-[14px] leading-none">×</span>
            </button>
          ))}
          <FilterPicker />
          {/* Feature 07 — live-filter search. Suspense satisfies Next's
              useSearchParams CSR-bailout requirement on prerendered routes. */}
          <Suspense fallback={null}>
            <TaskSearchInput />
          </Suspense>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-[11px] text-[#888] underline cursor-pointer bg-transparent border-0 hover:text-[#1a1a2e]"
            >
              clear all
            </button>
          )}
        </div>

        {/* Saved views (right) — only on Board / List. */}
        {supportsSavedViews && (
          <div ref={dropdownRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                setDropdownOpen((v) => {
                  // Closed → open: refresh counts (respects 60s memo).
                  if (!v) void fetchSavedViewCounts();
                  return !v;
                });
              }}
              className="text-xs px-3 py-[6px] rounded-lg border-[1.5px] border-[#e5e7eb] bg-white text-[#555] cursor-pointer font-medium hover:border-[#1a1a2e] transition-colors inline-flex items-center gap-[6px]"
            >
              ★ Saved views
              {savedViews.length > 0 && (
                <span className="text-[10px] font-mono text-[#9ca3af]">
                  {savedViews.length}
                </span>
              )}
              <span className="text-[10px]">▾</span>
            </button>
            {dropdownOpen && (
              <div className="absolute top-[110%] right-0 z-50 bg-white rounded-xl p-2 min-w-[260px] shadow-[0_8px_30px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]">
                <div className="max-h-[240px] overflow-y-auto">
                  {savedViews.length === 0 && (
                    <div className="text-[11px] text-[#9ca3af] px-2 py-2">
                      No saved views yet.
                    </div>
                  )}
                  {savedViews.map((v) => {
                    const renaming = renamingId === v.id;
                    const counts = savedViewCounts[v.id];
                    const desc = describeFilters(v);
                    return (
                      <div
                        key={v.id}
                        className="flex items-center gap-2 px-[6px] py-[5px] rounded-md text-[13px] hover:bg-[#fdf6e3]"
                      >
                        {renaming ? (
                          <>
                            <input
                              autoFocus
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void submitRename();
                                if (e.key === 'Escape') {
                                  setRenamingId(null);
                                  setRenameDraft('');
                                }
                              }}
                              className="flex-1 border-[1.5px] border-[#e5e7eb] rounded-md px-2 py-[3px] text-xs outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingId(null);
                                setRenameDraft('');
                              }}
                              className="text-[11px] text-[#888] bg-transparent border-0 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={submitRename}
                              disabled={!renameDraft.trim()}
                              className="text-[11px] font-bold text-[#1a1a2e] bg-transparent border-0 cursor-pointer disabled:opacity-50"
                            >
                              Save
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                loadView(v.id);
                                setDropdownOpen(false);
                              }}
                              className="flex-1 min-w-0 text-left bg-transparent border-0 cursor-pointer p-0"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-[13px] truncate">
                                  {v.name}
                                </span>
                                <CountPills counts={counts} />
                              </div>
                              <div className="text-[10px] font-mono text-[#9ca3af] truncate mt-[1px]">
                                {desc}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => beginRename(v)}
                              className="text-[10px] text-[#888] bg-transparent border-0 cursor-pointer hover:text-[#1a1a2e]"
                              title="Rename"
                            >
                              edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteView(v.id)}
                              className="text-[10px] text-[#dc2626] bg-transparent border-0 cursor-pointer"
                              title="Delete"
                            >
                              ×
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-[#eee] mt-1 pt-1">
                  {savingView ? (
                    <div className="flex items-center gap-2 p-1">
                      <input
                        autoFocus
                        value={saveDraft}
                        onChange={(e) => setSaveDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void submitSave();
                          if (e.key === 'Escape') {
                            setSavingView(false);
                            setSaveDraft('');
                          }
                        }}
                        placeholder="Name your view…"
                        className="flex-1 border-[1.5px] border-[#e5e7eb] rounded-md px-2 py-[4px] text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSavingView(false);
                          setSaveDraft('');
                        }}
                        className="text-[11px] text-[#888] bg-transparent border-0 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitSave}
                        disabled={!saveDraft.trim() || saveBusy}
                        className="text-[11px] font-bold text-white bg-[#1a1a2e] border-0 px-2 py-[3px] rounded-md cursor-pointer disabled:opacity-50"
                      >
                        {saveBusy ? '…' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSavingView(true)}
                      disabled={!hasActiveFilters}
                      className="w-full text-left px-2 py-1 border-0 bg-transparent text-xs text-[#1a1a2e] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={
                        hasActiveFilters
                          ? 'Save current filter combo'
                          : 'Add at least one filter to save'
                      }
                    >
                      + Save current filters as view
                    </button>
                  )}
                  <div className="text-[10px] font-mono text-[#9ca3af] text-center pt-1 lowercase tracking-wider">
                    click outside or press esc to close
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Explainer banner — only when filters are active. */}
      {hasActiveFilters && (
        <div className="mt-2 text-[11px] italic text-[#666]">
          <span className="font-semibold not-italic">Heads up:</span> New tasks
          created from this filtered view auto-inherit these filter values
          (you can override per field).
        </div>
      )}
    </div>
  );
}

// Feature 06 — three count pills shown on each saved-view row.
// Todo uses neutral gray (per spec, intentionally diverges from KANBAN_COLS
// purple so it recedes vs the active states); in-progress and done match the
// board palette.
const PILL_COLORS = {
  todo: '#6b7280',
  in_progress: '#f59e0b',
  done: '#10b981',
} as const;

function CountPills({
  counts,
}: {
  counts: { todo: number; in_progress: number; done: number } | undefined;
}) {
  const c = counts ?? { todo: 0, in_progress: 0, done: 0 };
  return (
    <span className="ml-auto inline-flex items-center gap-1 shrink-0">
      <Pill value={c.todo} color={PILL_COLORS.todo} label="To do" />
      <Pill value={c.in_progress} color={PILL_COLORS.in_progress} label="In progress" />
      <Pill value={c.done} color={PILL_COLORS.done} label="Done" />
    </span>
  );
}

function Pill({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <span
      title={`${label}: ${value}`}
      className="min-w-[22px] h-[22px] px-[6px] rounded-full text-[11px] font-bold flex items-center justify-center"
      style={{ background: color + '18', color }}
    >
      {value}
    </span>
  );
}

// Renders the saved view's filter dimensions as a short mono string, e.g.
// "board · 2 projects · 1 tag". Only includes dimensions that exist in the
// current Filters type — `due` from the spec example isn't a real dimension yet.
function describeFilters(v: SavedView): string {
  const f = v.filters;
  const parts: string[] = [v.view_type];
  const counts: [number, string, string][] = [
    [f.project_ids?.length ?? 0, 'project', 'projects'],
    [f.category_ids?.length ?? 0, 'category', 'categories'],
    [f.tag_ids?.length ?? 0, 'tag', 'tags'],
    [f.priorities?.length ?? 0, 'priority', 'priorities'],
  ];
  for (const [n, s, p] of counts) {
    if (n > 0) parts.push(`${n} ${n === 1 ? s : p}`);
  }
  return parts.join(' · ');
}
