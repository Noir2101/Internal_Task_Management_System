import { Inject, Injectable } from '@nestjs/common';
import { assertOr403, loadOr404 } from '../../common/authz/scoped';
import { CLOCK, type Clock } from '../../common/clock';
import { DueStatus } from '../domain/due-status';
import { Progress } from '../domain/task.entity';
import { TaskPolicy } from '../domain/task-policy';
import { TASK_QUERY_PORT, type TaskQueryPort } from './ports/task-query.port';
import { TASK_WRITE_PORT, type TaskWritePort } from './ports/task-write.port';
import { TaskView } from './task-view';

/**
 * PATCH /tasks/:id/progress — đổi tiến độ. One-law: assignee (docs/06 §3.1).
 * KHÔNG máy trạng thái: any→any (docs/06 §4.3). scoped-load (404) → assert isAssignee (403).
 */
@Injectable()
export class UpdateProgress {
  constructor(
    @Inject(TASK_QUERY_PORT) private readonly query: TaskQueryPort,
    @Inject(TASK_WRITE_PORT) private readonly write: TaskWritePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(params: {
    id: string;
    userId: string;
    scopeTeamId: string | null;
    progress: Progress;
  }): Promise<TaskView> {
    const task = loadOr404(
      await this.query.findByIdScoped(params.id, params.scopeTeamId),
    );
    assertOr403(
      TaskPolicy.isAssignee(params.userId, task),
      'NOT_TASK_ASSIGNEE',
      'Chỉ assignee được đổi tiến độ.',
    );
    const updated = await this.write.updateProgress(params.id, params.progress);
    return {
      task: updated,
      overdue: DueStatus.isOverdue(updated, this.clock.now()),
    };
  }
}
