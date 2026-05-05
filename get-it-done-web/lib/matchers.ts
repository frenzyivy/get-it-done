import type { ProjectType, TagType, TaskType } from '@/types';

// Feature 07 — live-filter search.
// Case-insensitive substring match across: title, project names, tag names,
// priority (label + code), and due date string. Shared between the Board
// FilterBar input and the Schedule sidebar input.

export interface SearchContext {
  projects: ProjectType[];
  tags: TagType[];
}

// Map priority -> a string that contains both the user-facing label and the
// internal code, so typing "urgent" or "high" both work.
const PRIORITY_LABELS: Record<TaskType['priority'], string> = {
  urgent: 'urgent p1',
  high: 'high p2',
  medium: 'medium p3',
  low: 'low p4',
};

export function buildTaskHaystack(task: TaskType, ctx: SearchContext): string {
  const projectNames = task.project_ids
    .map((id) => ctx.projects.find((p) => p.id === id)?.name ?? '')
    .join(' ');
  const tagNames = task.tag_ids
    .map((id) => ctx.tags.find((t) => t.id === id)?.name ?? '')
    .join(' ');
  const priority = PRIORITY_LABELS[task.priority] ?? task.priority ?? '';
  const due = task.due_date ?? '';
  return `${task.title} ${projectNames} ${tagNames} ${priority} ${due}`.toLowerCase();
}

export function matchesSearch(
  task: TaskType,
  query: string,
  ctx: SearchContext,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return buildTaskHaystack(task, ctx).includes(q);
}
