import type { Priority } from '@/types';

export interface AiSubtask {
  title: string;
}

export interface AiTagSuggestion {
  tag_id: string;
  name: string;
  confidence: number;
}

export interface DailySummaryResult {
  headline: string;
  wins: string[];
  focus_for_tomorrow: string[];
  observations: string[];
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export const aiClient = {
  generateSubtasks: (taskTitle: string) =>
    post<{ subtasks: AiSubtask[] }>('/api/ai/generate-subtasks', { task_title: taskTitle }),

  smartTag: (taskTitle: string) =>
    post<{ suggestions: AiTagSuggestion[] }>('/api/ai/smart-tag', { task_title: taskTitle }),

  estimateTask: (taskTitle: string, subtasks?: string[]) =>
    post<{ estimated_seconds: number; reasoning: string }>(
      '/api/ai/estimate-task',
      { task_title: taskTitle, subtasks },
    ),

  smartPriority: (taskTitle: string, dueDate?: string | null) =>
    post<{ priority: Priority; reasoning: string }>(
      '/api/ai/smart-priority',
      { task_title: taskTitle, due_date: dueDate ?? null },
    ),

  dailySummary: (date: string) =>
    post<DailySummaryResult>('/api/ai/daily-summary', { date }),
};
