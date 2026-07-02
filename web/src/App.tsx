import { Box, CircularProgress } from '@mui/material';
import { RouterProvider } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import { router } from './routes';

/**
 * Gates the router behind the auth bootstrap (docs/09 §3.3). While `booting`, show a splash so a
 * reload on a deep route (e.g. /tasks) rehydrates via refresh→me instead of flashing /login.
 */
export function App() {
  const { booting } = useAuth();

  if (booting) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return <RouterProvider router={router} />;
}
