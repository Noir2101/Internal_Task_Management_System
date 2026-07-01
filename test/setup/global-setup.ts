import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { TEST_DATABASE_URL } from './env';

/** Maintenance URL: cùng server nhưng trỏ DB `postgres` (luôn tồn tại) để CREATE DATABASE test. */
function maintenanceUrl(testUrl: string): string {
  const u = new URL(testUrl);
  u.pathname = '/postgres';
  return u.toString();
}

/** Tên DB test tách từ URL (segment cuối của pathname). */
function testDbName(testUrl: string): string {
  return new URL(testUrl).pathname.replace(/^\//, '').split('?')[0];
}

/**
 * jest globalSetup — chạy MỘT lần trước toàn bộ e2e:
 *   1. CREATE DATABASE itms_test nếu chưa có (kết nối DB maintenance `postgres`).
 *   2. `prisma migrate deploy` áp toàn bộ migration (gồm 4 raw-SQL constraint) lên DB test.
 * KHÔNG `db push`, KHÔNG `migrate reset` (kỷ luật /migrate). Data do reseed per-test lo (fixture.ts).
 */
export default async function globalSetup(): Promise<void> {
  const dbName = testDbName(TEST_DATABASE_URL);
  const admin = new PrismaClient({
    datasources: { db: { url: maintenanceUrl(TEST_DATABASE_URL) } },
  });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);

    console.log(`[e2e] created test database "${dbName}"`);
  } catch (err: unknown) {
    // 42P04 = duplicate_database → đã có, bỏ qua. Lỗi khác (vd không kết nối được) thì ném.
    const code = (err as { code?: string }).code;
    const msg = err instanceof Error ? err.message : String(err);
    if (code !== '42P04' && !/already exists/i.test(msg)) {
      throw new Error(
        `[e2e] không tạo được DB test "${dbName}". Postgres đã chạy chưa? ` +
          `(docker compose up -d postgres). Chi tiết: ${msg}`,
      );
    }
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
