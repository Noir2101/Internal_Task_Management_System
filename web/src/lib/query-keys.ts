import type { ListTasksParams } from '../features/tasks/types';

/**
 * TanStack Query key factory (docs/09 §3.1). Centralizing keys keeps cache invalidation consistent:
 * mutations invalidate `tasks.all` (the `['tasks']` prefix) to refetch both lists and details.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  tasks: {
    /** Prefix covering every task list + detail — invalidate this after any task mutation. */
    all: ['tasks'] as const,
    list: (params: ListTasksParams) => ['tasks', 'list', params] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
  },
  /** Team roster for assignee dropdowns (create/reassign/filter). */
  roster: (teamId: string) => ['roster', teamId] as const,
};
