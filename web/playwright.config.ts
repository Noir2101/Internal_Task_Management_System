import { defineConfig, devices } from '@playwright/test';

/**
 * Thin e2e (docs/09 §5): one login happy-path, a portfolio signal — not a full grid (backend has
 * 42 e2e). `webServer` starts the Vite dev server; the BACKEND (:3000) + seed must be running
 * separately (docker compose up -d postgres · npm run seed · npm run start:dev).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
