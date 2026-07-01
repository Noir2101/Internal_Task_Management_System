/**
 * setupFiles — chạy TRƯỚC khi test file import AppModule (nên PrismaClient/ConfigModule đọc đúng env).
 * Trỏ DATABASE_URL sang DB test riêng `itms_test`. `@nestjs/config` (dotenv) KHÔNG override biến
 * process.env đã set → giá trị ở đây thắng `.env`. MAIL_ENABLED xoá → NoopNotifier (e2e không gửi email).
 */

/** Cho phép trỏ DB test qua env (vd chạy trên Postgres local); mặc định = compose Postgres 18 (5433). */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://itms:itms@localhost:5433/itms_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
delete process.env.MAIL_ENABLED; // → NoopNotifier (mặc-định-offline)

// Auth secrets hermetic cho test (không phụ thuộc .env có mặt hay không).
process.env.JWT_ACCESS_SECRET ??=
  'e2e-test-access-secret-at-least-32-characters-long';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.REFRESH_TTL_DAYS ??= '7';
