import { Navigate, useParams } from 'react-router-dom';
import { TeamDetailView } from '../features/teams/TeamDetailView';
import { paths } from '../routes/paths';

/** Admin → team detail (members / leader-swap / break-glass). Reads :id from the route. */
export function AdminTeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={paths.adminTeams} replace />;
  return <TeamDetailView teamId={id} />;
}
