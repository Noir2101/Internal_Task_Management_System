import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { LoginPage } from '../pages/LoginPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AdminUsersPage } from '../pages/AdminUsersPage';
import { AdminUserCreatePage } from '../pages/AdminUserCreatePage';
import { AdminTeamsPage } from '../pages/AdminTeamsPage';
import { AdminTeamDetailPage } from '../pages/AdminTeamDetailPage';
import { DashboardPage } from '../pages/DashboardPage';
import { TasksListPage } from '../pages/TasksListPage';
import { TaskCreatePage } from '../pages/TaskCreatePage';
import { TaskDetailPage } from '../pages/TaskDetailPage';
import { IndexRedirect } from './IndexRedirect';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleRoute } from './RoleRoute';
import { paths } from './paths';

export const router = createBrowserRouter([
  { path: paths.login, element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <IndexRedirect /> },
          {
            element: <RoleRoute allow={['MEMBER', 'LEADER']} />,
            children: [
              { path: 'tasks', element: <TasksListPage /> },
              { path: 'tasks/new', element: <TaskCreatePage /> },
              { path: 'tasks/:id', element: <TaskDetailPage /> },
            ],
          },
          {
            element: <RoleRoute allow={['LEADER']} />,
            children: [{ path: 'dashboard', element: <DashboardPage /> }],
          },
          {
            element: <RoleRoute allow={['ADMIN']} />,
            children: [
              { path: 'admin/users', element: <AdminUsersPage /> },
              { path: 'admin/users/new', element: <AdminUserCreatePage /> },
              { path: 'admin/teams', element: <AdminTeamsPage /> },
              { path: 'admin/teams/:id', element: <AdminTeamDetailPage /> },
            ],
          },
          { path: '403', element: <ForbiddenPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
