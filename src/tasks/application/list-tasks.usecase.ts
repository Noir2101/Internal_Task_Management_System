import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock';
import { DueStatus } from '../domain/due-status';
import { Progress } from '../domain/task.entity';
import { TASK_QUERY_PORT, type TaskQueryPort } from './ports/task-query.port';
import { TaskView } from './task-view';

export interface ListTasksView {
  items: TaskView[];
  total: number;
  page: number;
  limit: number;
}

/**
 * GET /tasks — list trong nhóm, lọc + phân trang (docs/06 §4). scope suy từ teamId (KHÔNG param teamId).
 * `now` lấy MỘT lần: cờ `overdue` mỗi item VÀ filter `?overdue=` dùng CHUNG mốc (cổng 3) ⇒ không lệch.
 * Sort cố định createdAt DESC, id DESC ở adapter.
 */
@Injectable()
export class ListTasks {
  constructor(
    @Inject(TASK_QUERY_PORT) private readonly query: TaskQueryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(params: {
    scopeTeamId: string | null;
    page: number;
    limit: number;
    progress?: Progress;
    overdue?: boolean;
    assigneeId?: string;
    q?: string;
  }): Promise<ListTasksView> {
    const now = this.clock.now();
    const { page, limit } = params;
    const { items, total } = await this.query.list({
      scopeTeamId: params.scopeTeamId,
      now,
      progress: params.progress,
      overdue: params.overdue,
      assigneeId: params.assigneeId,
      q: params.q,
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.map((task) => ({
        task,
        overdue: DueStatus.isOverdue(task, now),
      })),
      total,
      page,
      limit,
    };
  }
}
