import { Progress, Task } from '../../domain/task.entity';

/** DI token cho port GHI. */
export const TASK_WRITE_PORT = Symbol('TASK_WRITE_PORT');

export interface CreateTaskInput {
  title: string;
  description: string | null;
  deadline: Date | null;
  ownerId: string;
  assigneeId: string;
}

/** Edit definition (owner). Field absent ⇒ giữ nguyên; null ⇒ set null (adapter bỏ qua undefined). */
export interface UpdateDefinitionInput {
  title?: string;
  description?: string | null;
  deadline?: Date | null;
}

/**
 * Port GHI task. Map domain↔Prisma CHỈ ở adapter. Mỗi method trả Task tươi (kèm owner/assignee)
 * để use-case gắn `overdue` và projection.
 *
 * `isTeamMember` đọc bảng User để validate assignee — Tasks cần BẢNG User (có sau seed), KHÔNG phụ
 * thuộc module Users (Bước 5). Dùng bởi CreateTask (leader giao in-team) và ReassignTask (in-team + active).
 */
export interface TaskWritePort {
  create(input: CreateTaskInput): Promise<Task>;
  updateDefinition(id: string, input: UpdateDefinitionInput): Promise<Task>;
  updateProgress(id: string, progress: Progress): Promise<Task>;
  reassign(id: string, assigneeId: string): Promise<Task>;
  softDelete(id: string): Promise<void>;
  isTeamMember(
    userId: string,
    teamId: string,
    opts?: { activeOnly?: boolean },
  ): Promise<boolean>;
}
