import { apiClient } from '../../lib/api-client';
import type {
  CreateUserInput,
  DeactivateResult,
  ListUsersParams,
  UpdateUserInput,
  User,
  UserListResult,
} from './types';

/**
 * Admin user endpoint calls (docs/06 §9). Every call rides the single api-client (Bearer +
 * refresh-retry-once, relative URLs). Success bodies are raw projections; failures become ApiError
 * in the interceptor, so call sites branch on `code`. All routes are ADMIN-only server-side —
 * wrong-role callers get 404 (hide), not 403.
 */

/** GET /users — axios drops undefined params, so omitted filters aren't sent. */
export async function listUsers(params: ListUsersParams): Promise<UserListResult> {
  const res = await apiClient.get<UserListResult>('/users', { params });
  return res.data;
}

/** POST /users → 201. id/isActive/createdAt are server-derived — only whitelisted body fields go out. */
export async function createUser(input: CreateUserInput): Promise<User> {
  const res = await apiClient.post<User>('/users', input);
  return res.data;
}

/** PATCH /users/:id → 200. Body is `{name}` ONLY (role/teamId immutable). */
export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const res = await apiClient.patch<User>(`/users/${id}`, input);
  return res.data;
}

/** POST /users/:id/deactivate → 200 {user, orphanedTaskCount}. Also revokes refresh tokens server-side. */
export async function deactivateUser(id: string): Promise<DeactivateResult> {
  const res = await apiClient.post<DeactivateResult>(`/users/${id}/deactivate`);
  return res.data;
}

/** POST /users/:id/reactivate → 200 {user}. Unwrap to the user projection. */
export async function reactivateUser(id: string): Promise<User> {
  const res = await apiClient.post<{ user: User }>(`/users/${id}/reactivate`);
  return res.data.user;
}
