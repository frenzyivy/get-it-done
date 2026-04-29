import type { Filters, TaskType } from '@/types';

// Filter semantics (Change #4):
// - Empty arrays mean "no constraint" for that dimension.
// - Across dimensions: AND. A task must match every active dimension.
// - Within a dimension: OR. project_ids: [A, B] matches tasks with project A or B.
export function matchesFilters(task: TaskType, filters: Filters): boolean {
  if (filters.project_ids.length > 0) {
    if (!task.project_ids.some((id) => filters.project_ids.includes(id))) return false;
  }
  if (filters.category_ids.length > 0) {
    if (!task.category_ids.some((id) => filters.category_ids.includes(id))) return false;
  }
  if (filters.tag_ids.length > 0) {
    if (!task.tag_ids.some((id) => filters.tag_ids.includes(id))) return false;
  }
  if (filters.priorities.length > 0) {
    if (!filters.priorities.includes(task.priority)) return false;
  }
  return true;
}
