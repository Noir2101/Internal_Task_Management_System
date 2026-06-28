import { Task } from './task.entity';

/**
 * Phân quyền MỨC BẢN GHI (docs/06 §3) — PURE predicate, không guard role, không I/O.
 * Use-case ghép đúng MỘT predicate/endpoint (one-law-per-endpoint), assert SAU scoped-load
 * (miss→404 đã chặn trước; còn lại là "thấy được nhưng đúng/sai quyền" → pass/403).
 *
 * - owner    sở hữu ĐỊNH NGHĨA task  → sửa (PATCH /:id) và xoá (DELETE /:id).
 * - assignee được giao             → đổi tiến độ (PATCH /:id/progress).
 * - cùng-nhóm: scope = nhóm của assignee; admin (teamId null) KHÔNG thuộc nhóm nào ⇒ false
 *   (khớp §3.2: scoped-load chặn admin khỏi /tasks thường).
 *
 * ownership ≠ assignment: hai predicate độc lập trên cùng một task.
 */
export const TaskPolicy = {
  isOwner(userId: string, task: Task): boolean {
    return task.owner.id === userId;
  },

  isAssignee(userId: string, task: Task): boolean {
    return task.assignee.id === userId;
  },

  isSameTeam(userTeamId: string | null, task: Task): boolean {
    return userTeamId !== null && task.assigneeTeamId === userTeamId;
  },
};
