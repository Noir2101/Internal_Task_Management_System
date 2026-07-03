import { expect, test } from '@playwright/test';

/**
 * Slice 3 render smoke (docs/09 §5) — a portfolio signal, not a full grid. Covers the three new
 * surfaces: the leader dashboard (KPIs + Recharts charts actually render — caught only in a real
 * browser), the admin user-create form's admin↔team conditional (mass-assignment-relevant UX), and
 * the admin team-detail (members / leader-swap / break-glass). Read/interaction only — no DB writes.
 * Requires the backend (:3000) + seed running. Seed: admin@demo.local / be.lead@demo.local / Password123!.
 */
const PASSWORD = 'Password123!';

async function login(page: import('@playwright/test').Page, email: string, landing: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => url.pathname === landing);
}

test('leader: dashboard renders KPIs + both charts', async ({ page }) => {
  await login(page, 'be.lead@demo.local', '/dashboard');

  // KPI row (overdue is its own tile, never a progress bucket).
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Tổng công việc')).toBeVisible();

  // Both charts render as real SVG (Recharts) — the check tsc can't do.
  await expect(page.getByRole('heading', { name: 'Tiến độ — số lượng' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Theo người được giao' })).toBeVisible();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  expect(await page.locator('.recharts-surface').count()).toBeGreaterThanOrEqual(2);
});

test('admin: create-user form hides team for ADMIN, requires it otherwise', async ({ page }) => {
  await login(page, 'admin@demo.local', '/admin/users');

  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();
  await page.getByRole('link', { name: 'Tạo người dùng' }).click();
  await page.waitForURL((url) => url.pathname === '/admin/users/new');

  // Default role MEMBER → team field is shown (required for LEADER/MEMBER).
  await expect(page.getByLabel('Nhóm')).toBeVisible();

  // Switch to ADMIN → team field disappears (ADMIN carries no teamId — anti mass-assignment).
  await page.getByLabel('Vai trò').click();
  await page.getByRole('option', { name: 'ADMIN' }).click();
  await expect(page.getByLabel('Nhóm')).toHaveCount(0);
});

test('admin: team detail shows members, leader-swap, and break-glass', async ({ page }) => {
  await login(page, 'admin@demo.local', '/admin/users');

  await page.getByRole('link', { name: 'Nhóm' }).click();
  await page.waitForURL((url) => url.pathname === '/admin/teams');
  await page.getByRole('link', { name: 'Backend' }).click();
  await page.waitForURL((url) => /\/admin\/teams\/[^/]+$/.test(url.pathname));

  await expect(page.getByRole('heading', { name: 'Backend' })).toBeVisible();
  await expect(page.getByText('Trưởng nhóm hiện tại:')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Thành viên đang hoạt động' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Đổi trưởng nhóm' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Giải thể nhóm' })).toBeVisible();
});
