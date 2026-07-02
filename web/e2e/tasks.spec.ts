import { expect, test } from '@playwright/test';

/**
 * Tasks happy-path for a member (docs/09 §5) — a portfolio signal, not a full grid (backend has 42
 * e2e in docs/08). Exercises the core loop: login → create a self-assigned task → open its detail →
 * change progress. Also a light two-axis sanity check (progress + overdue are SEPARATE controls).
 * Requires the backend (:3000) + seed running (docker compose up -d postgres · npm run seed ·
 * npm run start:dev). Seed member: be.a@demo.local / Password123! (docs/08).
 */
const MEMBER = { email: 'be.a@demo.local', password: 'Password123!' };

test('member: login → create self-assigned task → change progress', async ({ page }) => {
  const title = `E2E task ${Date.now()}`;

  // Login.
  await page.goto('/login');
  await page.getByLabel('Email').fill(MEMBER.email);
  await page.getByLabel('Mật khẩu').fill(MEMBER.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => url.pathname === '/tasks');

  // Two-axis filters are two separate controls (docs/09 §3.5).
  await expect(page.getByLabel('Tiến độ')).toBeVisible();
  await expect(page.getByLabel('Quá hạn')).toBeVisible();

  // Create a self-assigned task (member assignee is locked to self — no picker rendered).
  await page.getByRole('link', { name: 'Tạo công việc' }).click();
  await page.waitForURL((url) => url.pathname === '/tasks/new');
  await page.getByLabel('Tiêu đề').fill(title);
  await page.getByRole('button', { name: 'Tạo', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/tasks');

  // Open its detail (newest first by createdAt DESC).
  await page.getByRole('link', { name: title }).click();
  await page.waitForURL((url) => /\/tasks\/[^/]+$/.test(url.pathname));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // Change progress (assignee control, any→any). Success toast confirms the write.
  await page.getByLabel('Đổi tiến độ').click();
  await page.getByRole('option', { name: 'DONE' }).click();
  await expect(page.getByText('Đã cập nhật tiến độ.')).toBeVisible();
});
