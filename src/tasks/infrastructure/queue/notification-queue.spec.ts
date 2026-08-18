import {
  isNotificationQueueEnabled,
  notificationQueueImports,
  notificationQueueProviders,
} from './notification-queue';

/**
 * Khoá seam bật/tắt queue (docs/11 §6) — song song với `throttler-storage.spec.ts` của slice 1.
 *
 * Bất biến đáng test nhất là đường KHÔNG có Redis. `npm test` và toàn bộ lưới e2e đi đường đó; nếu
 * ai đó đổi thành "luôn đăng ký queue" thì BullMQ mở socket lúc init và cả lưới treo ở chỗ khó đọc.
 * Chính file spec này chạy được mà không cần một Redis đang sống là bằng chứng cho điều đó.
 */
describe('seam queue thông báo', () => {
  describe('thiếu REDIS_URL → không đăng ký gì', () => {
    it.each([
      ['undefined', undefined],
      ['chuỗi rỗng', ''],
    ])('REDIS_URL là %s', (_label, url) => {
      expect(isNotificationQueueEnabled(url)).toBe(false);
      expect(notificationQueueImports(url)).toEqual([]);
      expect(notificationQueueProviders(url)).toEqual([]);
    });
  });

  describe('có REDIS_URL → đăng ký đủ hạ tầng', () => {
    const URL = 'redis://localhost:6379';

    it('bật cờ', () => {
      expect(isNotificationQueueEnabled(URL)).toBe(true);
    });

    it('imports gồm cấu hình kết nối và một queue', () => {
      expect(notificationQueueImports(URL)).toHaveLength(2);
    });

    it('providers gồm worker, lượt quét và bộ đăng ký lịch', () => {
      expect(notificationQueueProviders(URL)).toHaveLength(3);
    });
  });
});
