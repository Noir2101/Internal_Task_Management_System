import { BullModule } from '@nestjs/bullmq';
import type { DynamicModule, Provider } from '@nestjs/common';
import { NOTIFICATION_QUEUE } from './notification-queue.constants';
import { NotificationsProcessor } from './notifications.processor';
import { OverdueDigestScheduler } from './overdue-digest.scheduler';
import { OverdueDigestSweep } from './overdue-digest.sweep';

/**
 * Seam bật/tắt queue theo sự CÓ MẶT của `REDIS_URL` (GĐ11 slice 2, docs/11 §6) — cùng mẫu với
 * `resolveThrottlerStorage` của slice 1, nhưng quyết định phải nằm ở METADATA MODULE chứ không ở
 * runtime. Lý do: BullMQ không có bản in-memory, và `Queue` mặc định bật `enableOfflineQueue` với
 * `maxRetriesPerRequest: null`, nên `queue.add()` lúc vắng Redis sẽ TREO chứ không reject. Đăng ký
 * vô điều kiện là làm treo cả `npm run start:dev` lẫn lưới e2e ngay lúc khởi tạo.
 *
 * Trả mảng rỗng là hợp lệ, không phải thiếu sót: TasksModule spread hai mảng này vào `imports` và
 * `providers`, nên không có Redis thì đơn giản là không có queue, và `NOTIFIER` bind thẳng adapter
 * gửi trực tiếp.
 *
 * Hằng số nằm ở `notification-queue.constants.ts` chứ không ở đây — xem lý do trong file đó.
 */
export function isNotificationQueueEnabled(redisUrl?: string): boolean {
  return Boolean(redisUrl);
}

/**
 * Truyền URL dạng CHUỖI qua `connection.url` thay vì tự dựng instance ioredis — đúng bài học slice 1
 * (docs/11 §3.2): thư viện tự tạo client thì cũng tự đóng nó lúc shutdown, không rò handle.
 */
export function notificationQueueImports(redisUrl?: string): DynamicModule[] {
  if (!isNotificationQueueEnabled(redisUrl)) return [];
  return [
    BullModule.forRoot({ connection: { url: redisUrl } }),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ];
}

/** Worker, lượt quét, và bộ đăng ký lịch — chỉ tồn tại khi có Redis. */
export function notificationQueueProviders(redisUrl?: string): Provider[] {
  if (!isNotificationQueueEnabled(redisUrl)) return [];
  return [NotificationsProcessor, OverdueDigestSweep, OverdueDigestScheduler];
}
