import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import type { Role } from '../auth/types';
import { paths } from './paths';

/**
 * UX-only role gate (docs/09 §3.5, SEC-03): hides routes a role shouldn't reach. The backend still
 * enforces every action; this just avoids showing dead ends. Wrong role → concise 403 view.
 */
export function RoleRoute({ allow }: { allow: Role[] }) {
  const { identity } = useAuth();
  if (identity && !allow.includes(identity.role)) {
    return <Navigate to={paths.forbidden} replace />;
  }
  return <Outlet />;
}
