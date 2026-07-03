import type { Role } from '../auth/types';

/** Route path constants — one source of truth for links and redirects. */
export const paths = {
  login: '/login',
  tasks: '/tasks',
  taskNew: '/tasks/new',
  taskDetail: (id: string) => `/tasks/${id}`,
  dashboard: '/dashboard',
  adminUsers: '/admin/users',
  adminUserNew: '/admin/users/new',
  adminTeams: '/admin/teams',
  adminTeamDetail: (id: string) => `/admin/teams/${id}`,
  forbidden: '/403',
} as const;

/**
 * Post-login landing per role (docs/09 §3.3): admin has no team so tasks/dashboard are hidden;
 * leader lands on the stats dashboard; member on the team task list.
 */
export function roleLanding(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return paths.adminUsers;
    case 'LEADER':
      return paths.dashboard;
    case 'MEMBER':
      return paths.tasks;
  }
}
