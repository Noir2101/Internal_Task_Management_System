import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type {
  AssignedEvent,
  Notifier,
  ReassignedEvent,
  TasksOrphanedEvent,
} from '../../application/ports/notifier.port';
import { DIRECT_NOTIFIER } from '../direct-notifier';
import {
  JOB,
  NOTIFICATION_QUEUE,
  type OverdueDigestJobData,
} from './notification-queue.constants';
import { OverdueDigestSweep } from './overdue-digest.sweep';

/**
 * Worker của queue thông báo (GĐ11 slice 2, docs/11 §6). Đây là nơi việc gửi SMTP thật sự xảy ra,
 * sau khi request của client đã trả về từ lâu.
 *
 * Gọi `DIRECT_NOTIFIER` chứ KHÔNG gọi `NOTIFIER`: token thứ hai ở đường này là `QueuedNotifier`,
 * nên gọi nó thì mỗi job xử lý xong lại ghi thêm một job y hệt.
 *
 * KHÔNG bọc try/catch ở đây. Adapter đường worker chạy với `rethrow: true`, và lỗi phải nổi lên tới
 * BullMQ thì `attempts` mới đếm được và job hỏng mới nằm lại `failed` để soi. Bất biến "email không
 * vỡ task-write" vẫn nguyên: chỗ bảo vệ nó là `QueuedNotifier` ở phía ghi job, không phải chỗ này.
 */
@Processor(NOTIFICATION_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger('NotificationsWorker');

  constructor(
    @Inject(DIRECT_NOTIFIER) private readonly notifier: Notifier,
    private readonly sweep: OverdueDigestSweep,
  ) {
    super();
  }

  // `job.data` về từ JSON của Redis nên TypeScript chỉ biết nó là `any`. Ép kiểu tường minh tại đúng
  // nhánh đã biết tên job, thay vì để `any` chảy tiếp vào các method của port.
  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB.ASSIGNED:
        await this.notifier.notifyAssigned(job.data as AssignedEvent);
        return;
      case JOB.REASSIGNED:
        await this.notifier.notifyReassigned(job.data as ReassignedEvent);
        return;
      case JOB.ORPHANED:
        await this.notifier.notifyTasksOrphaned(job.data as TasksOrphanedEvent);
        return;
      case JOB.OVERDUE_DIGEST: {
        // `nowIso` là mốc do lượt quét chốt — dựng lại Date, KHÔNG gọi Clock ở đây (cổng 3).
        const data = job.data as OverdueDigestJobData;
        await this.notifier.notifyOverdueDigest({
          teamId: data.teamId,
          now: new Date(data.nowIso),
        });
        return;
      }
      case JOB.OVERDUE_DIGEST_SWEEP:
        await this.sweep.run();
        return;
      default:
        // Job lạ (ví dụ sót lại từ một phiên bản trước) — log rồi bỏ, không làm chết worker.
        this.logger.warn(`Bỏ qua job không rõ tên: ${job.name}`);
    }
  }
}
