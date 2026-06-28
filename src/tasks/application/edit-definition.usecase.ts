import { Inject, Injectable } from '@nestjs/common';
import { assertOr403, loadOr404 } from '../../common/authz/scoped';
import { CLOCK, type Clock } from '../../common/clock';
import { DueStatus } from '../domain/due-status';
import { TaskPolicy } from '../domain/task-policy';
import { TASK_QUERY_PORT, type TaskQueryPort } from './ports/task-query.port';
import { TASK_WRITE_PORT, type TaskWritePort } from './ports/task-write.port';
import { PastDeadlineConfirmationRequiredException } from './task.exceptions';
import { TaskView } from './task-view';

export interface EditDefinitionInput {
  title?: string;
  description?: string | null;
  deadline?: Date | null;
  allowPastDeadline?: boolean;
}

/**
 * PATCH /tasks/:id — sửa định nghĩa (title/description/deadline). One-law: owner (docs/06 §3.1).
 * Trình tự keystone: scoped-load (404) → assert isOwner (403 NOT_TASK_OWNER) → check past-deadline
 * (400) → ghi → trả view (overdue tính lại với cùng `now`).
 */
@Injectable()
export class EditDefinition {
  constructor(
    @Inject(TASK_QUERY_PORT) private readonly query: TaskQueryPort,
    @Inject(TASK_WRITE_PORT) private readonly write: TaskWritePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(params: {
    id: string;
    userId: string;
    scopeTeamId: string | null;
    input: EditDefinitionInput;
  }): Promise<TaskView> {
    const task = loadOr404(
      await this.query.findByIdScoped(params.id, params.scopeTeamId),
    );
    assertOr403(
      TaskPolicy.isOwner(params.userId, task),
      'NOT_TASK_OWNER',
      'Chỉ owner được sửa định nghĩa task.',
    );

    const now = this.clock.now();
    const { deadline, allowPastDeadline } = params.input;
    if (
      deadline != null &&
      deadline.getTime() < now.getTime() &&
      !allowPastDeadline
    ) {
      throw new PastDeadlineConfirmationRequiredException();
    }

    const updated = await this.write.updateDefinition(params.id, {
      title: params.input.title,
      description: params.input.description,
      deadline: params.input.deadline,
    });
    return { task: updated, overdue: DueStatus.isOverdue(updated, now) };
  }
}
