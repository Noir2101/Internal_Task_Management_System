import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { paths } from './paths';

/** Gate: requires an identity, else redirect to /login. Real authz is server-side (SEC-03). */
export function ProtectedRoute() {
  const { identity } = useAuth();
  if (!identity) return <Navigate to={paths.login} replace />;
  return <Outlet />;
}
