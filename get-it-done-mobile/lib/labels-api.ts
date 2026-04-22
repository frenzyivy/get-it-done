import { supabase } from './supabase';

// Next.js categories / projects API. Mirrors the shape of lib/ai.ts — we
// go through the deployed web app because RLS alone can't enforce the
// idempotent-attach logic the API wraps.

function webBase(): string {
  const base = process.env.EXPO_PUBLIC_WEB_URL;
  if (!base) {
    throw new Error(
      'EXPO_PUBLIC_WEB_URL is not set. Point it at the deployed Next.js app.',
    );
  }
  return base.replace(/\/$/, '');
}

async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  return `Bearer ${token}`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T | null> {
  const authorization = await authHeader();
  const res = await fetch(`${webBase()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

export const labelsApi = {
  createCategory: (body: { name: string; color?: string }) =>
    request<{ category: { id: string; name: string; color: string } }>(
      'POST',
      '/api/categories',
      body,
    ),
  updateCategory: (id: string, body: { name?: string; color?: string }) =>
    request<{ category: { id: string; name: string; color: string } }>(
      'PATCH',
      `/api/categories/${id}`,
      body,
    ),
  deleteCategory: (id: string) => request<null>('DELETE', `/api/categories/${id}`),
  attachCategory: (taskId: string, categoryId: string) =>
    request<{ ok: true }>(
      'POST',
      `/api/tasks/${taskId}/categories`,
      { category_id: categoryId },
    ),
  detachCategory: (taskId: string, categoryId: string) =>
    request<null>('DELETE', `/api/tasks/${taskId}/categories/${categoryId}`),

  createProject: (body: { name: string; color?: string; status?: string }) =>
    request<{ project: { id: string; name: string; color: string; status: 'active' | 'paused' | 'archived' } }>(
      'POST',
      '/api/projects',
      body,
    ),
  updateProject: (
    id: string,
    body: { name?: string; color?: string; status?: string },
  ) =>
    request<{ project: { id: string; name: string; color: string; status: 'active' | 'paused' | 'archived' } }>(
      'PATCH',
      `/api/projects/${id}`,
      body,
    ),
  deleteProject: (id: string) => request<null>('DELETE', `/api/projects/${id}`),
  attachProject: (taskId: string, projectId: string) =>
    request<{ ok: true }>(
      'POST',
      `/api/tasks/${taskId}/projects`,
      { project_id: projectId },
    ),
  detachProject: (taskId: string, projectId: string) =>
    request<null>('DELETE', `/api/tasks/${taskId}/projects/${projectId}`),
};
