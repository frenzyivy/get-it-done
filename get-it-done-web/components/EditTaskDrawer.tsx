'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PRIORITIES } from '@/lib/constants';
import { useStore } from '@/lib/store';
import { todayISO, tomorrowISO } from '@/lib/utils';
import { TagPicker } from './TagPicker';
import { CategoryPicker } from './CategoryPicker';
import { ProjectPicker } from './ProjectPicker';
import type { Priority, SubtaskType } from '@/types';

// Feature 3 — full edit drawer. Opens from TaskCard pencil icon and from
// timeline block clicks (Feature 1). All fields editable + subtask CRUD/reorder.
interface Props {
  taskId: string;
  onClose: () => void;
}

export function EditTaskDrawer({ taskId, onClose }: Props) {
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId));
  const tags = useStore((s) => s.tags);
  const updateTask = useStore((s) => s.updateTask);
  const updateTaskTags = useStore((s) => s.updateTaskTags);
  const updateTaskCategories = useStore((s) => s.updateTaskCategories);
  const updateTaskProjects = useStore((s) => s.updateTaskProjects);
  const addSubtask = useStore((s) => s.addSubtask);
  const renameSubtask = useStore((s) => s.renameSubtask);
  const deleteSubtask = useStore((s) => s.deleteSubtask);
  const reorderSubtasks = useStore((s) => s.reorderSubtasks);

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [estimateMin, setEstimateMin] = useState<number | null>(
    task?.estimated_seconds ? Math.round(task.estimated_seconds / 60) : null,
  );
  const [tagIds, setTagIds] = useState<string[]>(task?.tag_ids ?? []);
  const [categoryIds, setCategoryIds] = useState<string[]>(task?.category_ids ?? []);
  const [projectIds, setProjectIds] = useState<string[]>(task?.project_ids ?? []);
  const [allowAlarms, setAllowAlarms] = useState<boolean>(task?.allow_alarms ?? false);
  const [plannedForDate, setPlannedForDate] = useState<string>(task?.planned_for_date ?? '');
  const [newSub, setNewSub] = useState('');

  // Note: callers MUST pass `key={taskId}` when reusing this component for a
  // different task so React remounts and reseeds the form fields.

  // Esc closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  if (!task) return null;

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await updateTask(task.id, {
      title: trimmed,
      description: description.trim() || null,
      priority,
      due_date: dueDate || null,
      estimated_seconds: estimateMin ? estimateMin * 60 : null,
      allow_alarms: allowAlarms,
      planned_for_date: plannedForDate || null,
    });
    if (
      tagIds.length !== task.tag_ids.length ||
      tagIds.some((id) => !task.tag_ids.includes(id))
    ) {
      await updateTaskTags(task.id, tagIds);
    }
    if (
      categoryIds.length !== task.category_ids.length ||
      categoryIds.some((id) => !task.category_ids.includes(id))
    ) {
      await updateTaskCategories(task.id, categoryIds);
    }
    if (
      projectIds.length !== task.project_ids.length ||
      projectIds.some((id) => !task.project_ids.includes(id))
    ) {
      await updateTaskProjects(task.id, projectIds);
    }
    onClose();
  };

  const handleAddSub = async () => {
    const t = newSub.trim();
    if (!t) return;
    await addSubtask(task.id, t);
    setNewSub('');
  };

  const handleDeleteSub = async (sub: SubtaskType) => {
    if (sub.total_time_seconds > 0) {
      const ok = confirm(
        `This subtask has tracked time. Delete anyway? Time entries will be kept but unlinked from the subtask.`,
      );
      if (!ok) return;
    }
    await deleteSubtask(task.id, sub.id);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = task.subtasks.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    await reorderSubtasks(task.id, arrayMove(ids, from, to));
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30 animate-[fadeIn_0.15s_ease-out]"
      />
      <aside
        className="fixed top-0 right-0 z-50 h-screen w-full sm:w-[460px] bg-white shadow-[-8px_0_30px_rgba(0,0,0,0.12)] flex flex-col animate-[slideInRight_0.2s_ease-out]"
        role="dialog"
        aria-label="Edit task"
      >
        <div className="px-5 py-4 border-b border-[#eee] flex items-center justify-between">
          <div className="text-[13px] font-extrabold uppercase tracking-[0.5px] text-[#1a1a2e]">
            Edit task
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-0 text-[#aaa] hover:text-[#1a1a2e] cursor-pointer text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border-[1.5px] border-[#e5e7eb] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#8b5cf6]"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional notes…"
              className="w-full border-[1.5px] border-[#e5e7eb] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#8b5cf6] resize-y"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-2 text-[13px]"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estimate">
              <select
                value={estimateMin ?? ''}
                onChange={(e) =>
                  setEstimateMin(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-2 text-[13px]"
              >
                <option value="">No estimate</option>
                <option value="15">15m</option>
                <option value="25">25m</option>
                <option value="50">50m</option>
                <option value="60">1h</option>
                <option value="90">1h 30m</option>
                <option value="120">2h</option>
                <option value="180">3h</option>
                <option value="240">4h</option>
              </select>
            </Field>
          </div>

          <Field label="Due date">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dueDate ? dueDate.slice(0, 10) : ''}
                onChange={(e) => setDueDate(e.target.value)}
                className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-2 text-[13px]"
              />
              {dueDate && new Date(dueDate) < new Date(new Date().toDateString()) && (
                <span className="text-[10px] font-bold text-[#dc2626] bg-[#fee2e2] px-2 py-[2px] rounded-md">
                  Overdue
                </span>
              )}
              {dueDate && (
                <button
                  onClick={() => setDueDate('')}
                  className="text-[11px] text-[#aaa] bg-transparent border-0 cursor-pointer hover:text-[#dc2626]"
                >
                  Clear
                </button>
              )}
            </div>
          </Field>

          {/* "Plan for date" — separate from due_date; the day the user
              intends to work on this. Drives Today's 5 + tomorrow icons. */}
          <Field label="Plan for date">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={plannedForDate ? plannedForDate.slice(0, 10) : ''}
                onChange={(e) => setPlannedForDate(e.target.value)}
                className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-2 text-[13px]"
              />
              <button
                onClick={() => setPlannedForDate(todayISO())}
                className="text-[11px] font-bold text-[#8b5cf6] bg-[rgba(139,92,246,0.08)] border-0 rounded-md px-2 py-1 cursor-pointer"
              >
                Today
              </button>
              <button
                onClick={() => setPlannedForDate(tomorrowISO())}
                className="text-[11px] font-bold text-[#3b82f6] bg-[rgba(59,130,246,0.08)] border-0 rounded-md px-2 py-1 cursor-pointer"
              >
                Tomorrow
              </button>
              {plannedForDate && (
                <button
                  onClick={() => setPlannedForDate('')}
                  className="text-[11px] text-[#aaa] bg-transparent border-0 cursor-pointer hover:text-[#dc2626]"
                >
                  Clear
                </button>
              )}
            </div>
          </Field>

          <Field label="Category">
            <CategoryPicker selectedIds={categoryIds} onChange={setCategoryIds} />
          </Field>

          <Field label="Project">
            <ProjectPicker selectedIds={projectIds} onChange={setProjectIds} />
          </Field>

          <Field label="Tags">
            <TagPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} />
          </Field>

          {/* Feature 5 — per-task alarm passthrough during Strict mode */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allowAlarms}
              onChange={(e) => setAllowAlarms(e.target.checked)}
              className="w-4 h-4 cursor-pointer accent-[#8b5cf6]"
            />
            <div>
              <div className="text-[13px] font-bold text-[#1a1a2e]">
                Allow alarms during focus
              </div>
              <div className="text-[11px] text-[#888]">
                Scheduled alerts for this task still ring in Strict Zone.
              </div>
            </div>
          </label>

          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#888] mb-2">
              Subtasks ({task.subtasks.length})
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={task.subtasks.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-1">
                  {task.subtasks.map((s) => (
                    <SortableSubtaskRow
                      key={s.id}
                      subtask={s}
                      onRename={(t) => renameSubtask(task.id, s.id, t)}
                      onDelete={() => handleDeleteSub(s)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <div className="flex gap-2 mt-2">
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSub()}
                placeholder="Add subtask…"
                className="flex-1 border-[1.5px] border-[#e5e7eb] rounded-lg px-3 py-[6px] text-[13px] outline-none focus:border-[#8b5cf6]"
              />
              <button
                onClick={handleAddSub}
                className="px-3 py-[6px] rounded-lg bg-[rgba(139,92,246,0.1)] text-[#8b5cf6] text-[12px] font-bold cursor-pointer border-0"
              >
                + Add
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#eee] flex justify-end gap-2 bg-[#fafafa]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-transparent border-0 text-[#666] text-[13px] font-bold cursor-pointer hover:bg-black/[.04]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-[#8b5cf6] text-white border-0 text-[13px] font-bold cursor-pointer"
          >
            Save
          </button>
        </div>
      </aside>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#888] mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function SortableSubtaskRow({
  subtask,
  onRename,
  onDelete,
}: {
  subtask: SubtaskType;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: subtask.id });
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(subtask.title);

  const commit = () => {
    const t = val.trim();
    if (t && t !== subtask.title) onRename(t);
    setEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-2 px-2 py-[6px] bg-[#fafafa] rounded-lg group"
    >
      <button
        {...listeners}
        {...attributes}
        className="text-[#bbb] hover:text-[#888] cursor-grab bg-transparent border-0 px-1 leading-none"
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        ⋮⋮
      </button>
      {editing ? (
        <input
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setVal(subtask.title);
              setEditing(false);
            }
          }}
          className="flex-1 border-0 border-b-[1.5px] border-[#8b5cf6] outline-none text-[13px] py-[2px] bg-transparent"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className={`flex-1 text-[13px] cursor-text ${
            subtask.is_done ? 'line-through text-[#aaa]' : 'text-[#333]'
          }`}
        >
          {subtask.title}
        </span>
      )}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-[#ccc] hover:text-[#dc2626] bg-transparent border-0 text-sm cursor-pointer leading-none"
        title="Delete subtask"
        aria-label="Delete subtask"
      >
        ×
      </button>
    </div>
  );
}
