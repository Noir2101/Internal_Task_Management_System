import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same-origin dev (docs/09 §3.6): proxy /api → backend :3000 WITHOUT rewriting the path.
// Keeping the /api/v1 prefix means the browser sees the refresh cookie at Path=/api/v1/auth,
// so it is sent back on /auth/refresh + /auth/logout. Rewriting the path would break that.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
