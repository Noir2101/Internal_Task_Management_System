import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../common/clock';
import { PrismaService } from '../../../prisma/prisma.service';
import { NOTIFIER, type Notifier } from '../../application/ports/notifier.port';

/**
 * Lượt quét digest quá hạn (GĐ11 slice 2, docs/11 §6). Chạy từ job `overdue-digest-sweep`, tức job
 * do LỊCH ở Redis sinh ra, nên trong một lần đến hạn chỉ đúng một replica chạy hàm này.
 *
 * Nó KHÔNG tự gửi thư. Nó chốt mốc thời gian, liệt kê nhóm cần xét, rồi fan-out mỗi nhóm thành một
 * job riêng qua `NOTIFIER` (ở đường này là `QueuedNotifier`). Đổi lấy: một nhóm gửi hỏng chỉ retry
 * nhóm đó, và một lượt quét không biến thành một job chạy dài ôm hết mọi nhóm.
 *
 * MỘT `now` cho cả lượt (cổng 3): lấy đúng một lần ở đây rồi truyền xuống từng nhóm. Nếu để mỗi
 * nhóm tự gọi `Clock` thì các nhóm quét theo những mốc lệch nhau, và ranh giới OVERDUE trong cùng
 * một lượt digest sẽ không nhất quán.
 *
 * Chỉ xét nhóm CÓ leader đang hoạt động — không có người nhận thì quét cũng vô nghĩa. Điều kiện này
 * khớp đúng người nhận mà `notifyOverdueDigest` tra ra sau đó.
 */
@Injectable()
export class OverdueDigestSweep {
  private readonly logger = new Logger('OverdueDigest');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** @returns số nhóm đã xếp lịch gửi — dùng cho dòng log là bằng chứng "job chạy thật". */
  async run(): Promise<number> {
    const now = this.clock.now();
    const teams = await this.prisma.team.findMany({
      where: { members: { some: { role: 'LEADER', isActive: true } } },
      select: { id: true },
    });

    for (const team of teams) {
      await this.notifier.notifyOverdueDigest({ teamId: team.id, now });
    }

    this.logger.log(
      `digest sweep: xếp lịch ${teams.length} nhóm ở mốc ${now.toISOString()}`,
    );
    return teams.length;
  }
}
