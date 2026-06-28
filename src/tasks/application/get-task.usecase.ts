import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock';
import { loadOr404 } from '../../common/authz/scoped';
import { DueStatus } from '../domain/due-status';
import { TASK_QUERY_PORT, type TaskQueryPort } from './ports/task-query.port';
import { TaskView } from './task-view';

/**
 * KEYSTONE (docs/06 §3.2). scoped-load lọc theo nhóm trong adapter:
 *   miss (ngoài nhóm / không tồn tại / đã xoá / admin) → loadOr404 → 404 RESOURCE_NOT_FOUND.
 * KHÔNG nhánh 403: trong nhóm thì LUÔN đọc được (member thấy mọi task của nhóm). 403 chỉ ở mutation.
 * `now` lấy MỘT lần để gắn cờ overdue (cùng nguồn với filter list).
 */
@Injectable()
export class GetTask {
  constructor(
    @Inject(TASK_QUERY_PORT) private readonly query: TaskQueryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(id: string, scopeTeamId: string | null): Promise<TaskView> {
    const task = loadOr404(await this.query.findByIdScoped(id, scopeTeamId));
    return { task, overdue: DueStatus.isOverdue(task, this.clock.now()) };
  }
}
