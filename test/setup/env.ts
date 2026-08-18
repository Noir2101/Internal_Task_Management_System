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

/**
 * Cách khoá một biến là GÁN giá trị falsy, KHÔNG `delete`.
 *
 * `ConfigModule.forRoot()` điền biến từ `.env` qua bộ lọc `!(key in process.env)`, tức nó chỉ chừa
 * ra key ĐÃ TỒN TẠI. `delete` làm key biến mất, nên dotenv thấy chỗ trống rồi điền giá trị của `.env`
 * vào — đúng ngược điều mong muốn. Với `MAIL_ENABLED` thì hậu quả là lưới e2e dựng `EmailNotifier`
 * và bắn email THẬT qua SMTP của `.env` mỗi lần test tạo task, reassign, hay deactivate.
 */
process.env.MAIL_ENABLED = 'false'; // → NoopNotifier (mặc-định-offline), không chạm mạng

// GĐ11: khoá cả hai đường Redis — throttle store (slice 1) và queue thông báo (slice 2). Lưới e2e
// phải chạy được khi không có Redis, và không được mượn Redis của máy dev qua `.env`.
process.env.REDIS_URL = '';

// Auth secrets hermetic cho test (không phụ thuộc .env có mặt hay không).
process.env.JWT_ACCESS_SECRET ??=
  'e2e-test-access-secret-at-least-32-characters-long';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.REFRESH_TTL_DAYS ??= '7';
