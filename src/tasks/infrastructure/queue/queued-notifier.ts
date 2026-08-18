import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  AssignedEvent,
  Notifier,
  OverdueDigestEvent,
  ReassignedEvent,
  TasksOrphanedEvent,
} from '../../application/ports/notifier.port';
import { JOB, NOTIFICATION_JOB_OPTS } from './notification-queue.constants';

/**
 * QueuedNotifier — lớp bọc (decorator) đặt SAU seam `Notifier` (GĐ11 slice 2, docs/11 §6).
 *
 * Use-case không biết có queue hay không: `CreateTask`, `ReassignTask` và `Users.deactivate` vẫn
 * inject `NOTIFIER` và gọi đúng các method cũ. Đổi duy nhất là cái nằm sau token đó — trước là
 * adapter gửi SMTP ngay trong đường request, giờ là lớp này, chỉ ghi một job rồi trả về. Việc gửi
 * thật do worker làm ở `NotificationsProcessor`.
 *
 * Payload CHỈ mang ID và chuỗi ISO, KHÔNG mang email — đúng kỷ luật "event mang ID" của docs/07.A
 * §3, và nhờ vậy không địa chỉ email nào nằm trong Redis.
 *
 * Failure policy: BỌC `queue.add` trong try/catch. Redis chết mà `add` reject thì `CreateTask` vỡ,
 * tức tái tạo đúng cái mà bất biến docs/07.A §5 cấm. Redis chết dẫn tới mất thông báo kèm log lỗi;
 * KHÔNG có đường lặng lẽ rơi về gửi đồng bộ, vì như vậy là dựng lại chính cái đường request-chậm mà
 * slice này đang gỡ đi.
 */
export class QueuedNotifier implements Notifier {
  private readonly logger = new Logger('Notifier');

  constructor(private readonly queue: Queue) {}

  notifyAssigned(event: AssignedEvent): Promise<void> {
    return this.enqueue(JOB.ASSIGNED, event, event.taskId);
  }

  notifyReassigned(event: ReassignedEvent): Promise<void> {
    return this.enqueue(JOB.REASSIGNED, event, event.taskId);
  }

  notifyTasksOrphaned(event: TasksOrphanedEvent): Promise<void> {
    return this.enqueue(JOB.ORPHANED, event, event.teamId);
  }

  /**
   * `Date` không sống sót qua JSON của Redis, nên `now` đi dưới dạng chuỗi ISO và processor dựng lại
   * `Date`. Chuỗi đó nằm ngay trong payload job, nên "mọi nhóm trong một lượt quét dùng chung một
   * mốc" là thứ soi được bằng mắt lúc kiểm chứng chứ không phải chỉ tin vào code.
   */
  notifyOverdueDigest(event: OverdueDigestEvent): Promise<void> {
    return this.enqueue(
      JOB.OVERDUE_DIGEST,
      { teamId: event.teamId, nowIso: event.now.toISOString() },
      event.teamId,
    );
  }

  private async enqueue(
    name: string,
    payload: object,
    target: string,
  ): Promise<void> {
    try {
      await this.queue.add(name, payload, NOTIFICATION_JOB_OPTS);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Không ghi được job ${name} vào queue (target=${target}): ${reason}`,
      );
    }
  }
}
