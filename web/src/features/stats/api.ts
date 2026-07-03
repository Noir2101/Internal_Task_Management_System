import { apiClient } from '../../lib/api-client';
import type { StatsResponse } from './types';

/**
 * Leader stats read-model (docs/06 §5). NO teamId param — scope is derived server-side from the JWT.
 * LEADER-only at the edge; member+admin get 403 INSUFFICIENT_ROLE (not 404).
 */
export async function getStats(): Promise<StatsResponse> {
  const res = await apiClient.get<StatsResponse>('/stats');
  return res.data;
}
