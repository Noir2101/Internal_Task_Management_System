import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock';
import {
  TASK_QUERY_PORT,
  type TaskAggregate,
  type TaskQueryPort,
} from '../tasks/application/ports/task-query.port';

/**
 * Stats (THIN consumer). Inject CHỈ `TASK_QUERY_PORT` (ISP — không thấy write port) + `CLOCK`.
 * KHÔNG Prisma trực tiếp (cổng 1), KHÔNG port riêng (Stats tiêu thụ port đọc của Tasks), KHÔNG phụ
 * thuộc module Users/Teams. `now` lấy MỘT lần từ Clock ⇒ overdue của aggregate dùng chung mốc với
 * cờ/filter list (cổng 3). Type port inject phải `import type` (TS1272 — bài học Bước 4).
 */
@Injectable()
export class StatsService {
  constructor(
    @Inject(TASK_QUERY_PORT) private readonly query: TaskQueryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** scope = teamId của leader (guard đảm bảo non-null); KHÔNG nhận teamId từ client. */
  getTeamStats(scopeTeamId: string): Promise<TaskAggregate> {
    return this.query.aggregate(scopeTeamId, this.clock.now());
  }
}
