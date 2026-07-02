import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { roleLanding } from './paths';

/** Index route: send an authenticated user to their role's landing screen (docs/09 §3.3). */
export function IndexRedirect() {
  const { identity } = useAuth();
  // Rendered under ProtectedRoute, so identity is always present here.
  return <Navigate to={roleLanding(identity!.role)} replace />;
}
