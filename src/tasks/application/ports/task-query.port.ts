import { Progress, Task, UserRef } from '../../domain/task.entity';

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

/** Phân rã của MỘT người phụ trách (docs/06 §5). `byProgress` luôn đủ 3 key (0 nếu rảnh). */
export interface AssigneeAggregate {
  /** {id,name} — UserRef domain, KHÔNG nhả toàn bộ user (cổng 2 loại field cấm). */
  assignee: UserRef;
  byProgress: Record<Progress, number>;
  overdue: number;
}

/**
 * Read-model dashboard của nhóm (docs/06 §5). Hình dạng ÉP CỨNG 3 bất biến OVERDUE:
 *   - `byProgress` đúng 3 key (KHÔNG bucket OVERDUE thứ tư).
 *   - `overdue` là SIBLING (không phải key trong byProgress) ⇒ không đếm trùng.
 *   - `total` = tổng byProgress (= tổng các số trong byAssignee); `overdue` NẰM NGOÀI total.
 * `byAssignee` = HỢP(member đang hoạt động của nhóm, mọi assignee còn task trong scope) — outer-join,
 * nên member rảnh hiện toàn 0 và member inactive còn task treo VẪN hiện (không task nào rơi khỏi phân rã).
 */
export interface TaskAggregate {
  scope: { teamId: string; teamName: string };
  total: number;
  byProgress: Record<Progress, number>;
  overdue: number;
  byAssignee: AssigneeAggregate[];
}

/**
 * Port ĐỌC task. scoped-load (lọc theo nhóm) realize trong adapter — đây là choke-point keystone:
 * miss (ngoài nhóm / không tồn tại / đã xoá / admin) → null → use-case `loadOr404` → 404.
 */
export interface TaskQueryPort {
  findByIdScoped(id: string, scopeTeamId: string | null): Promise<Task | null>;
  list(query: ListTasksQuery): Promise<ListTasksResult>;
  /**
   * Aggregate read-model cho Stats (Bước 6, docs/06 §5). `scopeTeamId` non-null: `RolesGuard([LEADER])`
   * chặn admin (teamId null) ở rìa ⇒ adapter chỉ nhận leader. `now` từ Clock (cổng 3) — overdue dùng
   * CHUNG mốc + ĐÚNG predicate với cờ/filter list. Outer-join User×Task hiện thực trong adapter
   * (đọc bảng User/Team trực tiếp — KHÔNG phụ thuộc module Users/Teams).
   */
  aggregate(scopeTeamId: string, now: Date): Promise<TaskAggregate>;
  /**
   * Đếm task treo (chưa-DONE, non-deleted) gán cho một assignee — KHÔNG scoped (đếm chéo nhóm theo
   * assigneeId). Khác `findByIdScoped`/`list` (đã scoped theo nhóm): đây là read đặc quyền, chỉ luồng
   * admin `deactivate` (Bước 5) dùng để báo `orphanedTaskCount` (docs/06 §9.3). Admin gọi deactivate
   * không có nhóm nên không thể đi qua scoped-load — cần đường đếm thẳng theo assigneeId.
   */
  countByAssignee(assigneeId: string): Promise<number>;
}
