'use client';

import { useState } from 'react';
import { PRIORITIES } from '@/lib/constants';
import { useStore } from '@/lib/store';
import { TagPicker } from './TagPicker';
import { CategoryPicker } from './CategoryPicker';
import { ProjectPicker } from './ProjectPicker';
import { AiSuggestionPanel } from './AiSuggestionPanel';
import type { Priority, Status } from '@/types';

interface Props {
  defaultStatus?: Status;
  // Per-priority "+ Add" entry points (e.g. Priority view's lane buttons) pass
  // this so the new task auto-stamps the lane's priority. Filter inheritance
  // wins if a priority filter is also active.
  defaultPriority?: Priority;
  // Per-project "+ Add task to [project]" entry points (List by Project view)
  // pass this so the new task is pre-attached to that project. Filter
  // inheritance for project_ids still wins.
  defaultProjectIds?: string[];
  forceOpen?: boolean;
  onClose?: () => void;
  hideTrigger?: boolean;
  // Custom label for the closed-state trigger button. Lets per-lane buttons
  // say "+ Add Urgent task" instead of the generic "+ New Task".
  triggerLabel?: string;
}

export function AddTaskForm({
  defaultStatus = 'todo',
  defaultPriority,
  defaultProjectIds,
  forceOpen,
  onClose,
  hideTrigger,
  triggerLabel,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = forceOpen ?? internalOpen;
  const filters = useStore((s) => s.filters);
  const tags = useStore((s) => s.tags);
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
  const addTask = useStore((s) => s.addTask);
  const addSubtask = useStore((s) => s.addSubtask);

  // Sticky inheritance (Change #4) — when filters are active and the form
  // opens, pre-fill matching dimensions and remember which values were
  // inherited. The ↪ badge stays per-value: removing inherited value A drops
  // only A's badge; user-added value C never carries one.
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>(
    filters.priorities[0] ?? defaultPriority ?? 'medium',
  );
  const [tagIds, setTagIds] = useState<string[]>(filters.tag_ids);
  const [categoryIds, setCategoryIds] = useState<string[]>(filters.category_ids);
  const [projectIds, setProjectIds] = useState<string[]>(
    filters.project_ids.length > 0
      ? filters.project_ids
      : (defaultProjectIds ?? []),
  );
  const [inheritedTagIds, setInheritedTagIds] = useState<Set<string>>(
    () => new Set(filters.tag_ids),
  );
  const [inheritedCategoryIds, setInheritedCategoryIds] = useState<Set<string>>(
    () => new Set(filters.category_ids),
  );
  const [inheritedProjectIds, setInheritedProjectIds] = useState<Set<string>>(
    () => new Set(filters.project_ids),
  );
  const [priorityInherited, setPriorityInherited] = useState<boolean>(
    filters.priorities.length > 0,
  );
  const [dueDate, setDueDate] = useState('');
  const [estimateMin, setEstimateMin] = useState<number | null>(null);
  const [pendingSubtasks, setPendingSubtasks] = useState<string[]>([]);

  // Re-seed from current filters on the close→open transition so each new
  // task picks up today's filter state. Uses React's "store previous prop in
  // state, set during render when prop changes" pattern (per
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders) —
  // no useEffect, no refs. Once the form is open, mid-session filter changes
  // don't overwrite the user's in-progress entry (intentional: less surprising
  // than auto-merging).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTagIds(filters.tag_ids);
      setCategoryIds(filters.category_ids);
      // Project filter inheritance wins over defaultProjectIds; otherwise
      // seed from defaultProjectIds so per-card "+ Add task to X" prefills X.
      const seedProjects =
        filters.project_ids.length > 0
          ? filters.project_ids
          : (defaultProjectIds ?? []);
      setProjectIds(seedProjects);
      setInheritedTagIds(new Set(filters.tag_ids));
      setInheritedCategoryIds(new Set(filters.category_ids));
      // Only mark project values as inherited if they came from filters; the
      // per-card defaultProjectIds aren't "inherited" in the spec sense.
      setInheritedProjectIds(new Set(filters.project_ids));
      if (filters.priorities[0]) {
        setPriority(filters.priorities[0]);
        setPriorityInherited(true);
      } else {
        setPriority(defaultPriority ?? 'medium');
        setPriorityInherited(false);
      }
    }
  }

  // Wrappers that drop inherited-marks for values the user removes / changes.
  const updateTagIds = (next: string[]) => {
    const removed = tagIds.filter((id) => !next.includes(id));
    if (removed.length) {
      setInheritedTagIds((prev) => {
        const n = new Set(prev);
        for (const id of removed) n.delete(id);
        return n;
      });
    }
    setTagIds(next);
  };
  const updateCategoryIds = (next: string[]) => {
    const removed = categoryIds.filter((id) => !next.includes(id));
    if (removed.length) {
      setInheritedCategoryIds((prev) => {
        const n = new Set(prev);
        for (const id of removed) n.delete(id);
        return n;
      });
    }
    setCategoryIds(next);
  };
  const updateProjectIds = (next: string[]) => {
    const removed = projectIds.filter((id) => !next.includes(id));
    if (removed.length) {
      setInheritedProjectIds((prev) => {
        const n = new Set(prev);
        for (const id of removed) n.delete(id);
        return n;
      });
    }
    setProjectIds(next);
  };

  const reset = () => {
    setTitle('');
    setPriority(defaultPriority ?? 'medium');
    setTagIds([]);
    setCategoryIds([]);
    setProjectIds([]);
    setInheritedTagIds(new Set());
    setInheritedCategoryIds(new Set());
    setInheritedProjectIds(new Set());
    setPriorityInherited(false);
    setDueDate('');
    setEstimateMin(null);
    setPendingSubtasks([]);
    setInternalOpen(false);
    onClose?.();
  };

  const submit = async () => {
    if (!title.trim()) return;
    const taskId = await addTask({
      title: title.trim(),
      priority,
      tag_ids: tagIds,
      category_ids: categoryIds,
      project_ids: projectIds,
      due_date: dueDate || null,
      status: defaultStatus,
      estimated_seconds: estimateMin ? estimateMin * 60 : null,
    });
    if (taskId) {
      for (const sub of pendingSubtasks) {
        await addSubtask(taskId, sub);
      }
    }
    reset();
  };

  if (!open) {
    if (hideTrigger) return null;
    return (
      <button
        onClick={() => setInternalOpen(true)}
        className="w-full px-[14px] py-[10px] rounded-xl cursor-pointer text-[#1a1a2e] font-bold text-[13px] transition-all"
        style={{
          background: 'rgba(0,0,0,0.06)',
          border: '2px dashed rgba(0,0,0,0.25)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0,0,0,0.12)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0,0,0,0.06)';
        }}
      >
        {triggerLabel ?? '+ New Task'}
      </button>
    );
  }

  // Per-value inheritance preview chips. Each chip shows ↪ + value name and
  // removes itself + its inherited mark on click. User-added values never
  // appear here — only ones that came in from active filters.
  const inheritedChips: { key: string; label: string; remove: () => void }[] = [];
  for (const id of inheritedProjectIds) {
    const p = projects.find((x) => x.id === id);
    if (!p) continue;
    inheritedChips.push({
      key: `proj:${id}`,
      label: `PROJECT ${p.name}`,
      remove: () => updateProjectIds(projectIds.filter((x) => x !== id)),
    });
  }
  for (const id of inheritedCategoryIds) {
    const c = categories.find((x) => x.id === id);
    if (!c) continue;
    inheritedChips.push({
      key: `cat:${id}`,
      label: `CATEGORY ${c.name}`,
      remove: () => updateCategoryIds(categoryIds.filter((x) => x !== id)),
    });
  }
  for (const id of inheritedTagIds) {
    const t = tags.find((x) => x.id === id);
    if (!t) continue;
    inheritedChips.push({
      key: `tag:${id}`,
      label: `TAG ${t.name}`,
      remove: () => updateTagIds(tagIds.filter((x) => x !== id)),
    });
  }

  return (
    <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_2px_rgba(0,0,0,0.2)]">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Task title…"
        className="w-full border-0 border-b-2 border-[#e5e7eb] text-[15px] font-semibold py-[6px] outline-none bg-transparent box-border"
      />
      {inheritedChips.length > 0 && (
        <div className="flex flex-wrap gap-[6px] mt-[8px]">
          {inheritedChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.remove}
              className="inline-flex items-center gap-[6px] px-[10px] py-[4px] rounded-full bg-[#f3f4f6] border-[1px] border-[#e5e7eb] text-[11px] cursor-pointer hover:bg-[#e5e7eb] transition-colors"
              title="Inherited from filter — click to remove"
            >
              <span className="text-[#1a1a2e] font-bold">↪</span>
              <span className="font-mono uppercase tracking-wider text-[10px] text-[#666]">
                {c.label}
              </span>
              <span className="opacity-50 text-[12px] leading-none">×</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-[10px] flex-wrap items-center">
        <div className="inline-flex items-center gap-[4px]">
          {priorityInherited && (
            <span
              className="text-[14px] text-[#1a1a2e] font-bold"
              title="Inherited from active filter"
            >
              ↪
            </span>
          )}
          <select
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value as Priority);
              setPriorityInherited(false);
            }}
            className="text-xs px-2 py-1 rounded-lg border-[1.5px] border-[#e5e7eb]"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} Priority
              </option>
            ))}
          </select>
        </div>
        <CategoryPicker selectedIds={categoryIds} onChange={updateCategoryIds} />
        <ProjectPicker selectedIds={projectIds} onChange={updateProjectIds} />
        <TagPicker tags={tags} selectedIds={tagIds} onChange={updateTagIds} />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-xs px-2 py-1 rounded-lg border-[1.5px] border-[#e5e7eb]"
        />
        <select
          value={estimateMin ?? ''}
          onChange={(e) =>
            setEstimateMin(e.target.value ? Number(e.target.value) : null)
          }
          className="text-xs px-2 py-1 rounded-lg border-[1.5px] border-[#e5e7eb]"
          title="Estimate"
        >
          <option value="">No estimate</option>
          <option value="15">Est 15m</option>
          <option value="25">Est 25m</option>
          <option value="50">Est 50m</option>
          <option value="60">Est 1h</option>
          <option value="90">Est 1h 30m</option>
          <option value="120">Est 2h</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={reset}
          className="bg-transparent border-0 text-[#aaa] cursor-pointer text-[13px]"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          className="bg-[#1a1a2e] text-white border-0 rounded-lg px-4 py-[6px] text-[13px] font-bold cursor-pointer"
        >
          Create
        </button>
      </div>

      {pendingSubtasks.length > 0 && (
        <div className="mt-3 rounded-xl bg-[#f9fafb] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
            Will add {pendingSubtasks.length} subtask{pendingSubtasks.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-1 space-y-1">
            {pendingSubtasks.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-[13px] text-[#374151]">
                <span>• {s}</span>
                <button
                  onClick={() =>
                    setPendingSubtasks((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="text-[11px] text-[#9ca3af] hover:text-[#ef4444]"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AiSuggestionPanel
        taskTitle={title}
        dueDate={dueDate || null}
        selectedTagIds={tagIds}
        selectedCategoryIds={categoryIds}
        selectedProjectIds={projectIds}
        onAcceptSubtasks={(titles) => setPendingSubtasks((prev) => [...prev, ...titles])}
        onAcceptTags={(ids) =>
          setTagIds((prev) => Array.from(new Set([...prev, ...ids])))
        }
        onAcceptCategories={(ids) =>
          setCategoryIds((prev) => Array.from(new Set([...prev, ...ids])))
        }
        onAcceptProjects={(ids) =>
          setProjectIds((prev) => Array.from(new Set([...prev, ...ids])))
        }
        onAcceptEstimate={(seconds) => setEstimateMin(Math.round(seconds / 60))}
      />
    </div>
  );
}
