import type { Priority, Status } from '@/types';

export const PRIORITIES = [
  { value: 'low', label: 'Low', color: '#6b7280', bg: '#f3f4f6' },
  { value: 'medium', label: 'Med', color: '#d97706', bg: '#fef3c7' },
  { value: 'high', label: 'High', color: '#dc2626', bg: '#fee2e2' },
  { value: 'urgent', label: 'Urgent', color: '#ffffff', bg: '#dc2626' },
] as const satisfies ReadonlyArray<{
  value: Priority;
  label: string;
  color: string;
  bg: string;
}>;

export const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const TAG_COLORS = [
  '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#10b981',
  '#ef4444', '#3b82f6', '#a855f7', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16',
] as const;

export const KANBAN_COLS = [
  { id: 'todo', label: 'To do', icon: '○', accent: '#8b5cf6' },
  { id: 'in_progress', label: 'In progress', icon: '◐', accent: '#f59e0b' },
  { id: 'done', label: 'Done', icon: '●', accent: '#10b981' },
] as const satisfies ReadonlyArray<{
  id: Status;
  label: string;
  icon: string;
  accent: string;
}>;
