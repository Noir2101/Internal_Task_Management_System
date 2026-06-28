import { Inject, Injectable } from '@nestjs/common';
import { assertOr403, loadOr404 } from '../../common/authz/scoped';
import { TaskPolicy } from '../domain/task-policy';
import { TASK_QUERY_PORT, type TaskQueryPort } from './ports/task-query.port';
import { TASK_WRITE_PORT, type TaskWritePort } from './ports/task-write.port';

/**
 * DELETE /tasks/:id — xoá MỀM (tombstone deletedAt). One-law: owner (docs/06 §3.1/§10).
 * scoped-load (404) → assert isOwner (403) → softDelete. Trả void (controller 204);
 * GET sau đó → 404 vì task rớt khỏi scope (deletedAt != null). KHÔNG un-delete.
 */
@Injectable()
export class DeleteTask {
  constructor(
    @Inject(TASK_QUERY_PORT) private readonly query: TaskQueryPort,
    @Inject(TASK_WRITE_PORT) private readonly write: TaskWritePort,
  ) {}

  async execute(
    id: string,
    userId: string,
    scopeTeamId: string | null,
  ): Promise<void> {
    const task = loadOr404(await this.query.findByIdScoped(id, scopeTeamId));
    assertOr403(
      TaskPolicy.isOwner(userId, task),
      'NOT_TASK_OWNER',
      'Chỉ owner được xoá task.',
    );
    await this.write.softDelete(id);
  }
}
