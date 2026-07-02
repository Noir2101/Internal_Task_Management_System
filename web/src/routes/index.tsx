import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { LoginPage } from '../pages/LoginPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AdminTeamsPage } from '../pages/placeholders/AdminTeamsPage';
import { AdminUsersPage } from '../pages/placeholders/AdminUsersPage';
import { DashboardPage } from '../pages/placeholders/DashboardPage';
import { TasksPage } from '../pages/placeholders/TasksPage';
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
            children: [{ path: 'tasks', element: <TasksPage /> }],
          },
          {
            element: <RoleRoute allow={['LEADER']} />,
            children: [{ path: 'dashboard', element: <DashboardPage /> }],
          },
          {
            element: <RoleRoute allow={['ADMIN']} />,
            children: [
              { path: 'admin/users', element: <AdminUsersPage /> },
              { path: 'admin/teams', element: <AdminTeamsPage /> },
            ],
          },
          { path: '403', element: <ForbiddenPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
