import type { ListTasksParams } from '../features/tasks/types';
import type { ListUsersParams } from '../features/users/types';

/**
 * TanStack Query key factory (docs/09 §3.1). Centralizing keys keeps cache invalidation consistent:
 * mutations invalidate the resource `all` prefix (e.g. `['tasks']`) to refetch both lists and details.
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
  users: {
    /** Prefix covering every user list — invalidate after any user mutation. */
    all: ['users'] as const,
    list: (params: ListUsersParams) => ['users', 'list', params] as const,
  },
  teams: {
    /** Prefix covering the team list + details — invalidate after any team mutation. */
    all: ['teams'] as const,
    list: ['teams', 'list'] as const,
    detail: (id: string) => ['teams', 'detail', id] as const,
  },
  stats: {
    /** Leader dashboard read-model. */
    all: ['stats'] as const,
  },
  /** Team roster for assignee dropdowns (create/reassign/filter). */
  roster: (teamId: string) => ['roster', teamId] as const,
};
