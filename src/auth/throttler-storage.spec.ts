import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { resolveThrottlerStorage } from './throttler-storage';

/**
 * Khoá seam chọn store (docs/11 §2). Hai bất biến đáng test:
 *  - thiếu REDIS_URL ⇒ `undefined` ⇒ @nestjs/throttler rơi về in-memory. Đây là đường mà `npm test`
 *    và lưới e2e đi; nếu ai đó lỡ đổi thành "luôn dựng Redis", cả lưới sẽ treo vì không có Redis.
 *  - có REDIS_URL ⇒ store Redis, và `lazyConnect` giữ socket ĐÓNG cho tới lệnh đầu — test này chạy
 *    được mà không cần Redis sống chính là bằng chứng của điều đó.
 */
describe('resolveThrottlerStorage', () => {
  let created: ThrottlerStorageRedisService | undefined;

  afterEach(() => {
    // Adapter tự dựng client (disconnectRequired) → nhả handle qua hook của chính nó.
    created?.onModuleDestroy();
    created = undefined;
  });

  it.each([
    ['undefined', undefined],
    ['chuỗi rỗng', ''],
  ])(
    'trả undefined khi REDIS_URL là %s (giữ đường in-memory)',
    (_label, url) => {
      expect(resolveThrottlerStorage(url)).toBeUndefined();
    },
  );

  it('trả store Redis khi có REDIS_URL', () => {
    const storage = resolveThrottlerStorage('redis://localhost:6379');
    created = storage as ThrottlerStorageRedisService;

    expect(storage).toBeInstanceOf(ThrottlerStorageRedisService);
  });

  it('chưa mở kết nối lúc dựng (lazyConnect) — bootstrap không phụ thuộc Redis', () => {
    const storage = resolveThrottlerStorage(
      'redis://localhost:6379',
    ) as ThrottlerStorageRedisService;
    created = storage;

    // 'wait' = ioredis đã dựng nhưng chưa nối. Không lazyConnect thì đây là 'connecting'.
    expect(storage.redis.status).toBe('wait');
  });
});
