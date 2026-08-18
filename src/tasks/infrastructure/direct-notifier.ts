import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { Notifier } from '../application/ports/notifier.port';
import type { TaskQueryPort } from '../application/ports/task-query.port';
import { EmailNotifier } from './email-notifier';
import { createSmtpTransport } from './mail-transport';
import { NoopNotifier } from './noop-notifier';

/**
 * Token cho adapter GỬI THẬT, tách khỏi `NOTIFIER` từ GĐ11 slice 2 (docs/11 §6).
 *
 * Nó tồn tại để cắt vòng lặp. Khi queue bật, `NOTIFIER` là `QueuedNotifier`; nếu worker cũng gọi
 * `NOTIFIER` thì mỗi job xử lý xong lại đẻ ra một job y hệt. Worker phải gọi thẳng adapter, và đây
 * là tên gọi của nó.
 */
export const DIRECT_NOTIFIER = Symbol('DIRECT_NOTIFIER');

/**
 * Chọn adapter gửi theo cờ `MAIL_ENABLED` (docs/07.A §6) — phần này giữ nguyên xi từ trước slice 2,
 * chỉ dời ra khỏi `tasks.module.ts` cho gọn.
 *
 * `rethrow` bám theo việc queue có bật hay không, và đó là cách một provider phủ đúng cả hai thế giới:
 *   - queue TẮT: người tiêu thụ duy nhất là use-case, đang trong đường request ⇒ phải nuốt lỗi.
 *   - queue BẬT: người tiêu thụ duy nhất là worker, đã ngoài đường request ⇒ phải ném để BullMQ retry.
 */
export function createDirectNotifier(
  config: ConfigService,
  prisma: PrismaService,
  query: TaskQueryPort,
  opts: { rethrow: boolean },
): Notifier {
  if (config.get<string>('MAIL_ENABLED') !== 'true') return new NoopNotifier();
  return new EmailNotifier(
    prisma,
    query,
    createSmtpTransport(config),
    config.get<string>('MAIL_FROM')!,
    { rethrow: opts.rethrow },
  );
}
