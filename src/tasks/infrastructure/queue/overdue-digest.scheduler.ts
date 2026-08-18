import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import {
  DEFAULT_DIGEST_CRON,
  DIGEST_SCHEDULER_ID,
  JOB,
  NOTIFICATION_QUEUE,
} from './notification-queue.constants';

/**
 * Đăng ký lịch digest (GĐ11 slice 2, docs/11 §6). Đây là câu trả lời cho "cron chạy trên MỌI replica".
 *
 * `@Cron` của `@nestjs/schedule` sống trong tiến trình, nên N replica là N lần bắn và leader nhận N
 * bản digest trùng nhau. Muốn dùng nó thì phải tự viết thêm một khoá phân tán, tức tự dựng lại đúng
 * thứ mà Redis đã có sẵn. Vì vậy slice này KHÔNG thêm `@nestjs/schedule`.
 *
 * Repeatable job của BullMQ đặt lịch Ở REDIS dưới một id. Mọi replica cùng `upsert` một id thì kết
 * quả vẫn là MỘT lịch, mỗi lần đến hạn sinh MỘT job, và đúng một worker giành được job đó.
 *
 * Redis chết lúc bootstrap thì hàm này ném lỗi và app không lên. Cố ý, cùng triết lý fail-fast của
 * `createSmtpTransport` (docs/07.A §7): lên được mà lịch câm là kiểu hỏng không ai phát hiện ra.
 * compose đã có `depends_on: redis: service_healthy` cộng `restart: unless-stopped` lo phần chớp nhoáng.
 */
@Injectable()
export class OverdueDigestScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger('OverdueDigest');

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const pattern =
      this.config.get<string>('OVERDUE_DIGEST_CRON') ?? DEFAULT_DIGEST_CRON;

    // UTC tường minh: hợp đồng dùng ISO-8601 UTC ở mọi nơi, và múi giờ của container không nên là
    // thứ quyết định giờ gửi thư.
    await this.queue.upsertJobScheduler(
      DIGEST_SCHEDULER_ID,
      { pattern, tz: 'UTC' },
      {
        name: JOB.OVERDUE_DIGEST_SWEEP,
        opts: { removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } },
      },
    );

    this.logger.log(`lịch digest: "${pattern}" (UTC)`);
  }
}
