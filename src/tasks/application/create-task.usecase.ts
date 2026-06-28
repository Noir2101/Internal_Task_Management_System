import { Inject, Injectable } from '@nestjs/common';
import { assertOr403 } from '../../common/authz/scoped';
import { CLOCK, type Clock } from '../../common/clock';
import { DueStatus } from '../domain/due-status';
import { TASK_WRITE_PORT, type TaskWritePort } from './ports/task-write.port';
import { PastDeadlineConfirmationRequiredException } from './task.exceptions';
import { TaskView } from './task-view';

/** Role giữ ở dạng literal union (KHÔNG import @prisma/client — cổng 1 cho application). */
type CallerRole = 'ADMIN' | 'LEADER' | 'MEMBER';

/**
 * POST /tasks — tạo task. `ownerId` = người gọi (server-suy, KHÔNG vào body). Authz (docs/06 §3.1, §7.4):
 *   - member: chỉ tự-giao (assigneeId === ownerId) → else TASK_MEMBER_SELF_ASSIGN_ONLY.
 *   - leader: assignee phải thuộc nhóm → else TASK_ASSIGNEE_NOT_IN_TEAM.
 *   - admin (teamId null): không nhóm hợp lệ → rơi nhánh leader → TASK_ASSIGNEE_NOT_IN_TEAM (chặn).
 * deadline quá khứ thiếu cờ → 400. KHÔNG scoped-load (chưa có resource).
 */
@Injectable()
export class CreateTask {
  constructor(
    @Inject(TASK_WRITE_PORT) private readonly write: TaskWritePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(params: {
    ownerId: string;
    role: CallerRole;
    scopeTeamId: string | null;
    input: {
      title: string;
      description: string | null;
      deadline: Date | null;
      assigneeId: string;
      allowPastDeadline?: boolean;
    };
  }): Promise<TaskView> {
    const { ownerId, role, scopeTeamId, input } = params;

    if (role === 'MEMBER') {
      assertOr403(
        input.assigneeId === ownerId,
        'TASK_MEMBER_SELF_ASSIGN_ONLY',
        'Member chỉ được tự giao task cho chính mình.',
      );
    } else {
      const inTeam =
        scopeTeamId !== null &&
        (await this.write.isTeamMember(input.assigneeId, scopeTeamId));
      assertOr403(
        inTeam,
        'TASK_ASSIGNEE_NOT_IN_TEAM',
        'Chỉ được giao cho thành viên trong nhóm.',
      );
    }

    const now = this.clock.now();
    if (
      input.deadline != null &&
      input.deadline.getTime() < now.getTime() &&
      !input.allowPastDeadline
    ) {
      throw new PastDeadlineConfirmationRequiredException();
    }

    const task = await this.write.create({
      title: input.title,
      description: input.description,
      deadline: input.deadline,
      ownerId,
      assigneeId: input.assigneeId,
    });
    return { task, overdue: DueStatus.isOverdue(task, now) };
  }
}
