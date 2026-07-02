import { apiClient } from '../lib/api-client';
import type { Identity } from './types';

/**
 * Auth endpoint calls (docs/06 §6). Success responses are NOT enveloped — these return the raw
 * body shapes. All go through the single api-client so the refresh cookie + Bearer interceptors apply.
 */

export async function apiLogin(
  email: string,
  password: string,
): Promise<{ accessToken: string; user: Identity }> {
  const res = await apiClient.post<{ accessToken: string; user: Identity }>(
    '/auth/login',
    { email, password },
  );
  return res.data;
}

/** Bootstrap step 1: mint a new access token from the refresh cookie. */
export async function apiRefresh(): Promise<{ accessToken: string }> {
  const res = await apiClient.post<{ accessToken: string }>('/auth/refresh');
  return res.data;
}

/** Bootstrap step 2: re-fetch identity after a reload. */
export async function apiMe(): Promise<Identity> {
  const res = await apiClient.get<{ user: Identity }>('/auth/me');
  return res.data.user;
}

/** Best-effort logout: revokes the refresh token server-side and clears the cookie (204). */
export async function apiLogout(): Promise<void> {
  await apiClient.post('/auth/logout');
}
