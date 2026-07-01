import { Injectable } from '@nestjs/common';
import { Notifier } from '../application/ports/notifier.port';

/**
 * Notifier bản nộp — KHÔNG làm gì (seam). ReassignTask vẫn gọi `notifyReassigned` đúng điểm;
 * portfolio chỉ cần đổi binding sang `EmailNotifier` mà không động vào use-case.
 * (Bỏ tên tham số: implement hợp lệ với ít tham số hơn interface — TS structural.)
 */
@Injectable()
export class NoopNotifier implements Notifier {
  notifyAssigned(): Promise<void> {
    return Promise.resolve();
  }

  notifyReassigned(): Promise<void> {
    return Promise.resolve();
  }

  notifyTasksOrphaned(): Promise<void> {
    return Promise.resolve();
  }
}
