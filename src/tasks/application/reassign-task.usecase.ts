import { Inject, Injectable } from '@nestjs/common';
import { assertOr403, loadOr404 } from '../../common/authz/scoped';
import { CLOCK, type Clock } from '../../common/clock';
import { DueStatus } from '../domain/due-status';
import { NOTIFIER, type Notifier } from './ports/notifier.port';
import { TASK_QUERY_PORT, type TaskQueryPort } from './ports/task-query.port';
import { TASK_WRITE_PORT, type TaskWritePort } from './ports/task-write.port';
import { TaskView } from './task-view';

type CallerRole = 'ADMIN' | 'LEADER' | 'MEMBER';

/**
 * PATCH /tasks/:id/assignee — đổi người được giao. One-law: leader-only (docs/06 §3.1).
 * Trình tự: scoped-load (404) → assert role=LEADER (403; member in-team thấy được nhưng không đổi
 * → TASK_MEMBER_SELF_ASSIGN_ONLY) → target thuộc nhóm & đang hoạt động (403 TASK_ASSIGNEE_NOT_IN_TEAM)
 * → ghi → PHÁT event reassign (seam) → trả view. Reassign chỉ đổi assignee, KHÔNG đổi owner.
 */
@Injectable()
export class ReassignTask {
  constructor(
    @Inject(TASK_QUERY_PORT) private readonly query: TaskQueryPort,
    @Inject(TASK_WRITE_PORT) private readonly write: TaskWritePort,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(params: {
    id: string;
    role: CallerRole;
    scopeTeamId: string | null;
    newAssigneeId: string;
  }): Promise<TaskView> {
    const task = loadOr404(
      await this.query.findByIdScoped(params.id, params.scopeTeamId),
    );

    assertOr403(
      params.role === 'LEADER',
      'TASK_MEMBER_SELF_ASSIGN_ONLY',
      'Chỉ leader của nhóm được đổi người được giao.',
    );

    const validTarget =
      params.scopeTeamId !== null &&
      (await this.write.isTeamMember(params.newAssigneeId, params.scopeTeamId, {
        activeOnly: true,
      }));
    assertOr403(
      validTarget,
      'TASK_ASSIGNEE_NOT_IN_TEAM',
      'Người được giao phải là thành viên đang hoạt động trong nhóm.',
    );

    const previousAssigneeId = task.assignee.id;
    const updated = await this.write.reassign(params.id, params.newAssigneeId);
    await this.notifier.notifyReassigned({
      taskId: updated.id,
      previousAssigneeId,
      newAssigneeId: params.newAssigneeId,
    });
    return {
      task: updated,
      overdue: DueStatus.isOverdue(updated, this.clock.now()),
    };
  }
}
