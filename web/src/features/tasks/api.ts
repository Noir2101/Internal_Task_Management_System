import { apiClient } from '../../lib/api-client';
import type {
  CreateTaskInput,
  ListTasksParams,
  Progress,
  RosterMember,
  Task,
  TaskListResult,
  UpdateTaskInput,
} from './types';

/**
 * Task + roster endpoint calls (docs/06 §3/§4/§9). Every call rides the single api-client so the
 * Bearer + refresh-retry-once interceptors apply and URLs stay relative (same-origin seam). Success
 * bodies are NOT enveloped — these return the raw projection shapes. Failures become ApiError in the
 * interceptor, so call sites branch on `code`.
 */

/** GET /tasks — axios drops undefined params, so omitted filters are simply not sent. NO teamId. */
export async function listTasks(params: ListTasksParams): Promise<TaskListResult> {
  const res = await apiClient.get<TaskListResult>('/tasks', { params });
  return res.data;
}

/** KEYSTONE GET /tasks/:id — foreign/out-of-scope id → 404 RESOURCE_NOT_FOUND (scoped-load). */
export async function getTask(id: string): Promise<Task> {
  const res = await apiClient.get<Task>(`/tasks/${id}`);
  return res.data;
}

/** POST /tasks → 201. owner is server-derived; only the whitelisted body fields go out. */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const res = await apiClient.post<Task>('/tasks', input);
  return res.data;
}

/** PATCH /tasks/:id → 200. Caller passes only dirty fields (absent=keep, null=clear). */
export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const res = await apiClient.patch<Task>(`/tasks/${id}`, input);
  return res.data;
}

/** PATCH /tasks/:id/progress → 200. any→any (no state machine). */
export async function updateProgress(id: string, progress: Progress): Promise<Task> {
  const res = await apiClient.patch<Task>(`/tasks/${id}/progress`, { progress });
  return res.data;
}

/** PATCH /tasks/:id/assignee → 200. Leader-only server-side; member callers get 403. */
export async function reassignTask(id: string, assigneeId: string): Promise<Task> {
  const res = await apiClient.patch<Task>(`/tasks/${id}/assignee`, { assigneeId });
  return res.data;
}

/** DELETE /tasks/:id → 204 (no body). */
export async function deleteTask(id: string): Promise<void> {
  await apiClient.delete(`/tasks/${id}`);
}

/** GET /teams/:id/members — roster of the caller's OWN team; other team/admin → 404 (docs/06 §9). */
export async function getRoster(teamId: string): Promise<RosterMember[]> {
  const res = await apiClient.get<RosterMember[]>(`/teams/${teamId}/members`);
  return res.data;
}
