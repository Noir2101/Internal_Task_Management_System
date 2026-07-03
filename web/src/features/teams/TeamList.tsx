import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Link as MuiLink,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ApiError } from '../../lib/error';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../lib/format';
import { paths } from '../../routes/paths';
import { useTeams } from './hooks';
import { TeamNameDialog } from './TeamNameDialog';
import type { Team } from './types';

/**
 * Admin team list (docs/09 §2.4). GET /teams is a bare array (no pagination). Name links to the
 * detail screen (members / leader-swap / break-glass). Create + rename go through TeamNameDialog.
 */
export function TeamList() {
  const { data: teams, isError, error, isFetching } = useTeams();
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<Team | null>(null);

  let content: React.ReactNode;
  if (isError && !teams) {
    content = (
      <ErrorState
        message={error instanceof ApiError ? error.message : 'Đã xảy ra lỗi.'}
        requestId={error instanceof ApiError ? error.requestId : undefined}
      />
    );
  } else if (!teams) {
    content = (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  } else if (teams.length === 0) {
    content = (
      <Typography color="text.secondary" sx={{ py: 4 }}>
        Chưa có nhóm nào.
      </Typography>
    );
  } else {
    content = (
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Tên nhóm</TableCell>
              <TableCell>Ngày tạo</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {teams.map((team) => (
              <TableRow key={team.id} hover>
                <TableCell>
                  <MuiLink
                    component={RouterLink}
                    to={paths.adminTeamDetail(team.id)}
                    underline="hover"
                  >
                    {team.name}
                  </MuiLink>
                </TableCell>
                <TableCell>{formatDateTime(team.createdAt)}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setRenaming(team)}>
                    Đổi tên
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center">
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
          Nhóm
        </Typography>
        <Button variant="contained" onClick={() => setCreateOpen(true)}>
          Tạo nhóm
        </Button>
      </Stack>

      <Box sx={{ height: 4 }}>{isFetching && <LinearProgress />}</Box>

      {content}

      {createOpen && <TeamNameDialog mode="create" onClose={() => setCreateOpen(false)} />}
      {renaming && (
        <TeamNameDialog mode="rename" team={renaming} onClose={() => setRenaming(null)} />
      )}
    </Stack>
  );
}
