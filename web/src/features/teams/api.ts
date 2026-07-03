import { apiClient } from '../../lib/api-client';
import type { CreateTeamInput, Team, UpdateTeamInput } from './types';

/**
 * Admin team endpoint calls (docs/06 §9). ADMIN-only server-side (wrong-role → 404 hide). GET /teams
 * returns a BARE ARRAY (no {data,meta}) since the team count is small. Failures become ApiError.
 */

/** GET /teams → bare Team[] (no pagination envelope). */
export async function listTeams(): Promise<Team[]> {
  const res = await apiClient.get<Team[]>('/teams');
  return res.data;
}

/** GET /teams/:id → single Team. Out-of-scope/unknown → 404 RESOURCE_NOT_FOUND. */
export async function getTeam(id: string): Promise<Team> {
  const res = await apiClient.get<Team>(`/teams/${id}`);
  return res.data;
}

/** POST /teams → 201. Body `{name}` only. */
export async function createTeam(input: CreateTeamInput): Promise<Team> {
  const res = await apiClient.post<Team>('/teams', input);
  return res.data;
}

/** PATCH /teams/:id → 200. Body `{name}` only. */
export async function updateTeam(id: string, input: UpdateTeamInput): Promise<Team> {
  const res = await apiClient.patch<Team>(`/teams/${id}`, input);
  return res.data;
}

/** PUT /teams/:id/leader → 200 Team. `userId` must be an active member; else 400 LEADER_NOT_TEAM_MEMBER. */
export async function setLeader(id: string, userId: string): Promise<Team> {
  const res = await apiClient.put<Team>(`/teams/${id}/leader`, { userId });
  return res.data;
}

/** DELETE /teams/:id → 204 (break-glass). Non-empty → 409 TEAM_NOT_EMPTY. */
export async function deleteTeam(id: string): Promise<void> {
  await apiClient.delete(`/teams/${id}`);
}
