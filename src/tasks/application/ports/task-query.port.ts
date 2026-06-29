import { Progress, Task } from '../../domain/task.entity';

/** DI token cho port ĐỌC (ISP — Bước 6 Stats CHỈ thấy port này, không thấy write). */
export const TASK_QUERY_PORT = Symbol('TASK_QUERY_PORT');

/** Tham số list — `now` đi kèm để predicate `overdue` dùng CHUNG mốc với cờ (cổng 3). */
export interface ListTasksQuery {
  /** Nhóm của người gọi (null = admin) — scoped-load lọc theo nhóm của assignee. */
  scopeTeamId: string | null;
  now: Date;
  progress?: Progress;
  overdue?: boolean;
  assigneeId?: string;
  q?: string;
  skip: number;
  take: number;
}

export interface ListTasksResult {
  items: Task[];
  total: number;
}

/**
 * Port ĐỌC task. scoped-load (lọc theo nhóm) realize trong adapter — đây là choke-point keystone:
 * miss (ngoài nhóm / không tồn tại / đã xoá / admin) → null → use-case `loadOr404` → 404.
 *
 * `aggregate` (byProgress + byAssignee outer-join cho Stats) HOÃN tới Bước 6 — KHÔNG khai ở đây
 * (shape thuộc docs/06 §5, Bước 6; tránh khai chữ ký chưa kiểm chứng được).
 */
export interface TaskQueryPort {
  findByIdScoped(id: string, scopeTeamId: string | null): Promise<Task | null>;
  list(query: ListTasksQuery): Promise<ListTasksResult>;
  /**
   * Đếm task treo (chưa-DONE, non-deleted) gán cho một assignee — KHÔNG scoped (đếm chéo nhóm theo
   * assigneeId). Khác `findByIdScoped`/`list` (đã scoped theo nhóm): đây là read đặc quyền, chỉ luồng
   * admin `deactivate` (Bước 5) dùng để báo `orphanedTaskCount` (docs/06 §9.3). Admin gọi deactivate
   * không có nhóm nên không thể đi qua scoped-load — cần đường đếm thẳng theo assigneeId.
   */
  countByAssignee(assigneeId: string): Promise<number>;
}
