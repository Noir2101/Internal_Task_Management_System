import { useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Container,
  Toolbar,
  Typography,
} from '@mui/material';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import type { Role } from '../auth/types';
import { paths } from '../routes/paths';

interface NavItem {
  label: string;
  to: string;
  roles: Role[];
}

// Nav visibility is UX only (SEC-03) — the backend enforces access regardless of what is shown.
const NAV_ITEMS: NavItem[] = [
  { label: 'Công việc', to: paths.tasks, roles: ['MEMBER', 'LEADER'] },
  { label: 'Dashboard', to: paths.dashboard, roles: ['LEADER'] },
  { label: 'Người dùng', to: paths.adminUsers, roles: ['ADMIN'] },
  { label: 'Nhóm', to: paths.adminTeams, roles: ['ADMIN'] },
];

export function AppShell() {
  const { identity, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);

  const items = NAV_ITEMS.filter(
    (item) => identity && item.roles.includes(identity.role),
  );

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate(paths.login, { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" component="div" sx={{ mr: 2 }}>
            ITMS
          </Typography>
          {items.map((item) => (
            <Button
              key={item.to}
              component={RouterLink}
              to={item.to}
              color="inherit"
              variant={location.pathname.startsWith(item.to) ? 'outlined' : 'text'}
            >
              {item.label}
            </Button>
          ))}
          <Box sx={{ flexGrow: 1 }} />
          {identity && (
            <Typography variant="body2" sx={{ mr: 2 }}>
              {identity.name} · {identity.role}
            </Typography>
          )}
          <Button color="inherit" onClick={handleLogout} disabled={loggingOut}>
            Đăng xuất
          </Button>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
