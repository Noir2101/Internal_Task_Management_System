/**
 * Hằng số của queue thông báo (GĐ11 slice 2, docs/11 §6).
 *
 * Tách khỏi `notification-queue.ts` là BẮT BUỘC, không phải để cho gọn. File wiring kia import ba
 * class worker/sweep/scheduler, còn ba class đó cần tên queue và tên job. Để chung một file thì thành
 * vòng import, và hậu quả không phải lỗi biên dịch mà là `undefined` lúc decorator chạy: `@Processor`
 * cùng `@InjectQueue` nhận `undefined` rồi âm thầm rơi về queue tên `default`, nên app chết ở
 * bootstrap với "BullQueue_default is not available". File này KHÔNG được import gì từ trong queue.
 */

/** Tên queue trong Redis — mọi key của BullMQ nằm dưới `bull:itms-notifications:*`. */
export const NOTIFICATION_QUEUE = 'itms-notifications';

/**
 * Tên job. Bốn cái đầu ứng một-một với bốn hook của port `Notifier`; cái cuối là job do LỊCH sinh
 * ra, không phải do hook nào phát. Tách `sweep` (quét, fan-out) khỏi `overdue-digest` (gửi cho MỘT
 * nhóm) để mỗi nhóm là một job retry độc lập, và để một nhóm gửi hỏng không kéo theo nhóm khác.
 */
export const JOB = {
  ASSIGNED: 'assigned',
  REASSIGNED: 'reassigned',
  ORPHANED: 'orphaned',
  OVERDUE_DIGEST: 'overdue-digest',
  OVERDUE_DIGEST_SWEEP: 'overdue-digest-sweep',
} as const;

/**
 * Payload của job digest. `Date` không sống sót qua JSON nên mốc đi dưới dạng chuỗi ISO; processor
 * dựng lại `Date` từ đây thay vì gọi `Clock` (cả lượt quét dùng chung một mốc — cổng 3).
 */
export interface OverdueDigestJobData {
  teamId: string;
  nowIso: string;
}

/** Id của job scheduler. N replica upsert CÙNG id thì Redis vẫn chỉ giữ một lịch. */
export const DIGEST_SCHEDULER_ID = 'overdue-digest';

/** Mặc định 01:00 UTC hằng ngày, tức 08:00 giờ Việt Nam — leader mở hộp thư đầu giờ làm là thấy. */
export const DEFAULT_DIGEST_CRON = '0 1 * * *';

/**
 * Mặc định cho job gửi thư. `attempts` chỉ có nghĩa vì adapter ở đường worker chạy với
 * `rethrow: true` (xem `EmailNotifier`); nuốt lỗi thì job nào cũng "completed" và retry là đồ giả.
 * Giữ lại 500 job hỏng gần nhất để soi lúc kiểm chứng, và 100 job xong để thấy queue có chạy.
 */
export const NOTIFICATION_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
} as const;
