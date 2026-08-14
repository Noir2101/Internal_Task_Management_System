import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { ThrottlerStorage } from '@nestjs/throttler';

/**
 * Chọn store cho `ThrottlerModule` theo sự CÓ MẶT của `REDIS_URL` (GĐ11 slice 1, docs/11 §2).
 *
 * Trả `undefined` là hợp lệ, không phải thiếu sót: `ThrottlerStorageProvider` của @nestjs/throttler
 * dựng `ThrottlerStorageService` in-memory khi `options.storage` falsy. Nhờ vậy dev (`start:dev`) và
 * lưới test (`env.ts` không đặt `REDIS_URL`) chạy y như trước — KHÔNG cần Redis, không mở socket.
 * Compose đặt `REDIS_URL` ⇒ counter nằm ngoài tiến trình, mọi replica backend đếm chung một chỗ.
 *
 * Vì sao đây là lỗ hổng thật khi scale: store in-memory giữ counter trong RAM một tiến trình, nên
 * chạy N instance sau reverse-proxy thì "5 login/phút/IP" nở thành 5×N.
 *
 * Truyền URL dạng chuỗi (không phải instance ioredis tự dựng) để adapter tự tạo client VÀ tự đặt
 * `disconnectRequired` — `onModuleDestroy` của nó đóng kết nối giùm, không rò handle lúc shutdown.
 * `lazyConnect` hoãn mở socket tới lệnh đầu tiên: bootstrap không phụ thuộc Redis sẵn sàng.
 */
export function resolveThrottlerStorage(
  redisUrl?: string,
): ThrottlerStorage | undefined {
  if (!redisUrl) return undefined;
  return new ThrottlerStorageRedisService(redisUrl, { lazyConnect: true });
}
