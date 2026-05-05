'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { useDismissOnOutside } from '@/lib/hooks/useDismissOnOutside';
import { parseQuickAdd } from '@/lib/quickAddParser';
import { fmtShort } from '@/lib/utils';
import type { Priority, ProjectType } from '@/types';
import { QuickAddProjectMenu } from './QuickAddProjectMenu';
import { QuickAddActions, buildQuickActions } from './QuickAddActions';

// Returns the partial @-token from the last @ before `caret` up to `caret`,
// or null if the caret isn't inside an @-mention. Token must contain only
// word/dash chars (matches the parser's /@([\w\-]+)/ grammar).
function getActiveMention(text: string, caret: number): string | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '@') {
      // Must be at start of input or preceded by whitespace.
      if (i === 0 || /\s/.test(text[i - 1])) {
        return text.slice(i + 1, caret);
      }
      return null;
    }
    if (!/[\w\-]/.test(ch)) return null;
  }
  return null;
}

// Phase 5 step 15 — Quick-add command bar (Ctrl/Cmd+K). Frosted dark-glass
// card centered horizontally, anchored to the upper third of the viewport.
// See specs/getitdone-SPEC.md § "Quick-add command bar (Ctrl+K)" for the
// full grammar; this component is the render layer + submit pipeline only.

const INBOX_PROJECT_NAME = 'Inbox';

export function QuickAddBar() {
  // Phase 6 polish — mounted globally in app/layout.tsx. Pages set userId via
  // their own *Init client component (Dashboard.tsx, InsightsInit.tsx,
  // SettingsInit.tsx). When userId is null (login / unauthenticated routes),
  // we skip the keyboard listener and render nothing — no Ctrl+K target,
  // no empty bar, no broken Inbox lazy-create.
  const userId = useStore((s) => s.userId);
  const open = useStore((s) => s.quickAddOpen);
  const openQuickAdd = useStore((s) => s.openQuickAdd);
  const closeQuickAdd = useStore((s) => s.closeQuickAdd);
  const filters = useStore((s) => s.filters);
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
  const tasks = useStore((s) => s.tasks);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const savedViews = useStore((s) => s.savedViews);
  const loadView = useStore((s) => s.loadView);
  const addTask = useStore((s) => s.addTask);
  const addSubtask = useStore((s) => s.addSubtask);
  const addProject = useStore((s) => s.addProject);
  const startTrackingTask = useStore((s) => s.startTrackingTask);
  const showToast = useStore((s) => s.showToast);

  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [caret, setCaret] = useState(0);
  const [projectSel, setProjectSel] = useState(0);
  const [actionsSel, setActionsSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Active @-mention token (substring after '@' up to the caret), or null.
  const mention = useMemo(() => getActiveMention(input, caret), [input, caret]);

  // Visible project list — must mirror QuickAddProjectMenu's filtering exactly
  // so keyboard selection lines up with what's rendered.
  const visibleProjects = useMemo(() => {
    if (mention === null) return [];
    const q = mention.toLowerCase();
    const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
    return q ? sorted.filter((p) => p.name.toLowerCase().startsWith(q)) : sorted;
  }, [projects, mention]);

  const showProjectMenu = mention !== null;
  const showActionsMenu = !showProjectMenu && input.trim() === '';

  // Keep selection indexes in bounds when the underlying list changes.
  useEffect(() => {
    if (showProjectMenu && projectSel >= visibleProjects.length) {
      setProjectSel(0);
    }
  }, [showProjectMenu, projectSel, visibleProjects.length]);
  useEffect(() => {
    if (!showProjectMenu) setProjectSel(0);
  }, [showProjectMenu, mention]);
  useEffect(() => {
    if (!showActionsMenu) setActionsSel(0);
  }, [showActionsMenu]);

  // Global Ctrl/Cmd+K to toggle. Bound on every authenticated route via
  // app/layout.tsx; no-op on login / unauthenticated routes where userId
  // is still null (the listener never installs).
  useEffect(() => {
    if (!userId) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (open) closeQuickAdd();
        else openQuickAdd();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userId, open, openQuickAdd, closeQuickAdd]);

  // Reset on close→open and open→close transitions, using React's
  // "previous prop in state, set during render" pattern. Initial focus is
  // handled by autoFocus on the input element below — no ref reads here.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      // Reset typing state on close so the next open starts fresh.
      setInput('');
      setSubmitting(false);
      setCaret(0);
      setProjectSel(0);
      setActionsSel(0);
    }
  }

  const dismissRef = useDismissOnOutside<HTMLDivElement>(open, closeQuickAdd);

  // Replace the active "@partial" with "@CanonicalName " (trailing space)
  // and place the caret right after. The parser will exact-match the full
  // canonical name on submit.
  const pickProject = useCallback(
    (project: ProjectType) => {
      if (mention === null) return;
      // Find the @ that started the active token (caret - mention.length - 1).
      const atIdx = caret - mention.length - 1;
      if (atIdx < 0 || input[atIdx] !== '@') return;
      const before = input.slice(0, atIdx);
      const after = input.slice(caret);
      const insert = `@${project.name} `;
      const next = before + insert + after;
      const nextCaret = atIdx + insert.length;
      setInput(next);
      // Apply caret after React paints. queueMicrotask isn't enough here
      // because the input value updates on the next render.
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
        setCaret(nextCaret);
      });
    },
    [caret, input, mention],
  );

  const parsed = useMemo(
    () => parseQuickAdd(input, projects, categories, filters),
    [input, projects, categories, filters],
  );

  const submit = useCallback(
    async (startTimer: boolean) => {
      if (submitting) return;
      // Defensive: the bar shouldn't be reachable without userId, but the
      // store actions (addTask, addProject) all early-return on missing
      // userId so a stale call would silently no-op. Bail early to avoid
      // a confusing "submitted but nothing happened" UX.
      if (!userId) return;
      const title = parsed.title.trim();
      if (!title) return;
      setSubmitting(true);

      try {
        // Inbox fallback: if no project resolved AND no inherited filter,
        // lazy-create or reuse an "Inbox" project so quick-adds always have
        // a triage home (Phase 5 Decision Q2 = a).
        let projectIds = parsed.projectIds;
        if (projectIds.length === 0) {
          let inbox = projects.find(
            (p) => p.name.toLowerCase() === INBOX_PROJECT_NAME.toLowerCase(),
          );
          if (!inbox) {
            inbox = (await addProject(INBOX_PROJECT_NAME, '#9ca3af', 'active')) ?? undefined;
          }
          if (inbox) projectIds = [inbox.id];
        }

        const taskId = await addTask({
          title,
          priority: parsed.priority ?? 'medium',
          tag_ids: [],
          category_ids: parsed.categoryIds,
          project_ids: projectIds,
          due_date: parsed.dueDate,
          status: 'todo',
          estimated_seconds: parsed.estimateSeconds,
        });

        if (taskId) {
          for (const sub of parsed.subtasks) {
            await addSubtask(taskId, sub);
          }
          if (startTimer) {
            await startTrackingTask(taskId, null);
          }
        }

        // Per Decision: unresolved tokens don't block submit; surface a toast
        // naming what didn't match.
        const unresolved: string[] = [];
        if (parsed.unresolvedProjectTokens.length > 0) {
          unresolved.push(
            `project${parsed.unresolvedProjectTokens.length === 1 ? '' : 's'} @${parsed.unresolvedProjectTokens.join(', @')}`,
          );
        }
        if (parsed.unresolvedCategoryTokens.length > 0) {
          unresolved.push(
            `categor${parsed.unresolvedCategoryTokens.length === 1 ? 'y' : 'ies'} #${parsed.unresolvedCategoryTokens.join(', #')}`,
          );
        }
        if (unresolved.length > 0) {
          showToast(`Created task. Couldn't match ${unresolved.join(' or ')}.`);
        }

        if (startTimer) {
          // Shift+Enter — close the bar.
          closeQuickAdd();
        } else {
          // Sticky after Enter — clear input but keep the bar open + focused.
          setInput('');
          setCaret(0);
          queueMicrotask(() => inputRef.current?.focus());
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      userId,
      parsed,
      projects,
      addProject,
      addTask,
      addSubtask,
      startTrackingTask,
      showToast,
      closeQuickAdd,
    ],
  );

  if (!userId || !open) return null;

  return (
    <>
      <style>{`
        @keyframes quickAddChipIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      {/* Backdrop — semi-transparent black, click-through anywhere outside the
          card via useDismissOnOutside on the card root. */}
      <div
        className="fixed inset-0 z-[110]"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        aria-hidden
      />
      <div
        ref={dismissRef}
        className="fixed left-1/2 z-[111]"
        style={{
          top: '12vh',
          transform: 'translateX(-50%)',
          width: 620,
          maxWidth: '92vw',
          background: 'rgba(26,26,46,0.92)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.32)',
          borderRadius: 16,
          padding: '14px 16px',
          color: '#fff',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Quick add"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono uppercase tracking-[1.5px] text-white/55">
            Quick add
          </span>
          <span className="text-[10px] font-mono text-white/35 ml-auto">
            ⏎ create · ⇧⏎ create + start timer · esc to close
          </span>
        </div>
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
          }}
          onSelect={(e) => {
            const el = e.currentTarget;
            setCaret(el.selectionStart ?? 0);
          }}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyUp={(e) => {
            // Catch caret moves from arrow keys / home / end that don't
            // fire onSelect in every browser.
            setCaret(e.currentTarget.selectionStart ?? 0);
          }}
          onKeyDown={(e) => {
            if (showProjectMenu) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (visibleProjects.length > 0) {
                  setProjectSel((i) => (i + 1) % visibleProjects.length);
                }
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (visibleProjects.length > 0) {
                  setProjectSel(
                    (i) => (i - 1 + visibleProjects.length) % visibleProjects.length,
                  );
                }
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                if (visibleProjects.length > 0) {
                  e.preventDefault();
                  pickProject(visibleProjects[projectSel] ?? visibleProjects[0]);
                  return;
                }
                // No matches — fall through (Enter submits, Tab does default).
              }
              if (e.key === 'Escape') {
                // Close the dropdown only by stripping the @-token back to
                // before the @. Easiest: insert a space to break the mention.
                e.preventDefault();
                const atIdx = caret - (mention?.length ?? 0) - 1;
                if (atIdx >= 0 && input[atIdx] === '@') {
                  const before = input.slice(0, atIdx);
                  const after = input.slice(caret);
                  const next = before + after;
                  setInput(next);
                  requestAnimationFrame(() => {
                    const el = inputRef.current;
                    if (!el) return;
                    el.focus();
                    el.setSelectionRange(atIdx, atIdx);
                    setCaret(atIdx);
                  });
                }
                return;
              }
              // Other keys fall through to default input behavior.
            }
            if (showActionsMenu) {
              const actions = buildQuickActions({
                view,
                setView,
                savedViews,
                loadView,
                focusInput: () => inputRef.current?.focus(),
              });
              const enabled = actions.filter((a) => !a.disabled);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (enabled.length > 0) {
                  // Map current selection within full list, then advance to
                  // the next enabled action.
                  const order = actions
                    .map((a, idx) => ({ a, idx }))
                    .filter(({ a }) => !a.disabled)
                    .map(({ idx }) => idx);
                  const cur = order.indexOf(actionsSel);
                  const nextIdx = order[(cur + 1) % order.length];
                  setActionsSel(nextIdx);
                }
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (enabled.length > 0) {
                  const order = actions
                    .map((a, idx) => ({ a, idx }))
                    .filter(({ a }) => !a.disabled)
                    .map(({ idx }) => idx);
                  const cur = order.indexOf(actionsSel);
                  const prevIdx = order[(cur - 1 + order.length) % order.length];
                  setActionsSel(prevIdx);
                }
                return;
              }
              if (e.key === 'Enter') {
                const action = actions[actionsSel];
                if (action && !action.disabled) {
                  e.preventDefault();
                  action.run();
                  // Add task = focus stays here. Other actions close palette.
                  if (action.id !== 'add-task') {
                    closeQuickAdd();
                  }
                  return;
                }
              }
              // Esc falls through to the default close-palette branch below.
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit(e.shiftKey);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              closeQuickAdd();
            }
          }}
          placeholder="@project #category task title tomorrow !!! ~1h -> sub a; sub b"
          className="w-full bg-transparent border-0 outline-none text-[16px] font-medium text-white placeholder-white/35"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.18)', paddingBottom: 8 }}
        />

        {/* Live parse preview chips */}
        <div className="flex flex-wrap gap-[6px] mt-3 min-h-[24px]">
          {parsed.projectIds.map((id) => {
            const p = projects.find((x) => x.id === id);
            if (!p) return null;
            const inherited = parsed.inheritedProjectIds.has(id);
            return (
              <Chip key={`p:${id}`} kind="PROJECT" label={p.name} inherited={inherited} />
            );
          })}
          {parsed.categoryIds.map((id) => {
            const c = categories.find((x) => x.id === id);
            if (!c) return null;
            const inherited = parsed.inheritedCategoryIds.has(id);
            return (
              <Chip key={`c:${id}`} kind="CATEGORY" label={c.name} inherited={inherited} />
            );
          })}
          {parsed.priority && (
            <Chip
              kind="PRIORITY"
              label={priorityLabel(parsed.priority)}
              inherited={parsed.priorityInherited}
            />
          )}
          {parsed.estimateSeconds && (
            <Chip kind="EST" label={fmtShort(parsed.estimateSeconds)} />
          )}
          {parsed.dueDate && <Chip kind="DUE" label={parsed.dueDate} />}
          {parsed.subtasks.length > 0 && (
            <Chip kind="SUBTASKS" label={`+${parsed.subtasks.length}`} />
          )}
          {parsed.unresolvedProjectTokens.map((tok) => (
            <Chip key={`up:${tok}`} kind="?PROJECT" label={`@${tok}`} unresolved />
          ))}
          {parsed.unresolvedCategoryTokens.map((tok) => (
            <Chip key={`uc:${tok}`} kind="?CATEGORY" label={`#${tok}`} unresolved />
          ))}
          {input.trim() === '' && !showActionsMenu && (
            <span className="text-[10px] font-mono text-white/30">
              live preview — type to see what is detected
            </span>
          )}
        </div>

        {/* Resolved title preview when fields were stripped */}
        {parsed.title && parsed.title !== input && (
          <div className="text-[11px] text-white/55 mt-2 truncate">
            <span className="font-mono uppercase tracking-wider text-white/35">
              Title
            </span>{' '}
            “{parsed.title}”
          </div>
        )}

        {showProjectMenu && (
          <QuickAddProjectMenu
            query={mention ?? ''}
            projects={projects}
            tasks={tasks}
            selectedIndex={projectSel}
            onSelectedIndexChange={setProjectSel}
            onPick={pickProject}
          />
        )}

        {showActionsMenu && (
          <QuickAddActions
            selectedIndex={actionsSel}
            onSelectedIndexChange={setActionsSel}
            onActivate={(action) => {
              action.run();
              if (action.id !== 'add-task') {
                closeQuickAdd();
              }
            }}
            view={view}
            setView={setView}
            savedViews={savedViews}
            loadView={loadView}
            focusInput={() => inputRef.current?.focus()}
          />
        )}
      </div>
    </>
  );
}

function priorityLabel(p: Priority): string {
  return p === 'urgent' ? 'Urgent' : p === 'high' ? 'High' : p === 'medium' ? 'Medium' : 'Low';
}

function Chip({
  kind,
  label,
  inherited,
  unresolved,
}: {
  kind: string;
  label: string;
  inherited?: boolean;
  unresolved?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-full text-[11px] font-medium"
      style={{
        background: unresolved
          ? 'rgba(220,38,38,0.16)'
          : 'rgba(255,255,255,0.10)',
        color: unresolved ? '#fca5a5' : '#fff',
        border: unresolved
          ? '1px solid rgba(220,38,38,0.4)'
          : '1px solid rgba(255,255,255,0.12)',
        animation: 'quickAddChipIn 180ms ease-out',
      }}
    >
      {inherited && <span className="text-[12px] leading-none">↪</span>}
      <span className="text-[9px] font-mono uppercase tracking-wider opacity-65">
        {kind}
      </span>
      <span>{label}</span>
    </span>
  );
}
