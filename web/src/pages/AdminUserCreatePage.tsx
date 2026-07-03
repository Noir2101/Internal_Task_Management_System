import { useNavigate } from 'react-router-dom';
import { Stack, Typography } from '@mui/material';
import { UserForm } from '../features/users/UserForm';
import { useCreateUser } from '../features/users/hooks';
import { useTeams } from '../features/teams/hooks';
import type { CreateUserInput } from '../features/users/types';
import { paths } from '../routes/paths';

/** Create-user screen. Owns the mutation; the form is presentational (docs/09 §2.4). */
export function AdminUserCreatePage() {
  const navigate = useNavigate();
  const createMut = useCreateUser();
  const { data: teams = [] } = useTeams();

  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Tạo người dùng
      </Typography>
      <UserForm
        teams={teams}
        submitting={createMut.isPending}
        onSubmit={async (payload: CreateUserInput) => {
          await createMut.mutateAsync(payload);
        }}
        onSuccess={() => navigate(paths.adminUsers)}
        onCancel={() => navigate(paths.adminUsers)}
      />
    </Stack>
  );
}
