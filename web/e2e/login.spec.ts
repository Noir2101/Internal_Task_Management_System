import { expect, test } from '@playwright/test';

/**
 * Login happy-path for the three seed roles (prisma/seed.ts, password docs/08). Asserts the
 * keystone auth flow: correct role landing, access token stays in RAM (not localStorage),
 * reload rehydrates via the refresh cookie (docs/09 §3.6), and logout returns to /login.
 * Requires the backend (:3000) + seed to be running.
 */
const PASSWORD = 'Password123!';

const cases = [
  { role: 'admin', email: 'admin@demo.local', landing: '/admin/users' },
  { role: 'leader', email: 'be.lead@demo.local', landing: '/dashboard' },
  { role: 'member', email: 'be.a@demo.local', landing: '/tasks' },
] as const;

for (const c of cases) {
  test(`${c.role} logs in → ${c.landing} → logs out`, async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill(c.email);
    await page.getByLabel('Mật khẩu').fill(PASSWORD);
    await page.getByTestId('login-submit').click();

    await page.waitForURL((url) => url.pathname === c.landing);

    // Access token must live in RAM only — never localStorage (docs/09 §3.5).
    const localStorageLength = await page.evaluate(() => window.localStorage.length);
    expect(localStorageLength).toBe(0);

    // Reload drops the RAM token; bootstrap (refresh→me) must rehydrate and keep us on the page.
    await page.reload();
    await page.waitForURL((url) => url.pathname === c.landing);
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();

    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.waitForURL((url) => url.pathname === '/login');
  });
}
