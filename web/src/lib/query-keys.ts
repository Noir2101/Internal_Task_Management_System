/**
 * TanStack Query key factory (docs/09 §3.1). Slice 1 only needs auth identity; tasks/stats/users
 * keys are added in Slice 2/3. Centralizing keys keeps cache invalidation consistent.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
};
