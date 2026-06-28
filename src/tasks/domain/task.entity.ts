/**
 * Task entity (PURE — cổng 1: KHÔNG @prisma/@nestjs/infrastructure).
 *
 * KHÔNG có cột `teamId`: scope của task = nhóm của assignee, SUY RA lúc map ở adapter
 * (`assigneeTeamId` là field dẫn xuất, KHÔNG phải cột DB — docs/06 §3, src/tasks/CLAUDE.md).
 * ownership ≠ assignment: `owner` và `assignee` là hai người tách biệt (có thể trùng khi member tự tạo).
 */

/** Tham chiếu người tối thiểu — projection chỉ lộ {id,name} cho owner/assignee (docs/06 §8.2). */
export interface UserRef {
  id: string;
  name: string;
}

/**
 * Giá trị tiến độ — KHỚP enum DB (docs/06 §1: TODO/IN_PROGRESS/DONE), nhưng KHAI BÁO TẠI DOMAIN
 * để không import `@prisma/client` (cổng 1). Adapter map identity vì giá trị trùng khít.
 * KHÔNG có máy trạng thái: any→any (assignee đổi tự do).
 */
export type Progress = 'TODO' | 'IN_PROGRESS' | 'DONE';

export class Task {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly progress: Progress;
  readonly deadline: Date | null;
  readonly owner: UserRef;
  readonly assignee: UserRef;
  /** Nhóm của assignee — scope suy ra; KHÔNG bao giờ serialize ra response (cổng 2 loại nó). */
  readonly assigneeTeamId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: {
    id: string;
    title: string;
    description: string | null;
    progress: Progress;
    deadline: Date | null;
    owner: UserRef;
    assignee: UserRef;
    assigneeTeamId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.title = props.title;
    this.description = props.description;
    this.progress = props.progress;
    this.deadline = props.deadline;
    this.owner = props.owner;
    this.assignee = props.assignee;
    this.assigneeTeamId = props.assigneeTeamId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
