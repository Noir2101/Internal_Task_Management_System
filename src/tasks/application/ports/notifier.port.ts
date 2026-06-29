/** DI token cho Notifier. */
export const NOTIFIER = Symbol('NOTIFIER');

/** Event reassign — phát đúng điểm trong ReassignTask (seam). */
export interface ReassignedEvent {
  taskId: string;
  previousAssigneeId: string;
  newAssigneeId: string;
}

/**
 * Event "task treo" — phát khi admin deactivate một member còn task chưa-DONE (docs/06 §9.3),
 * để báo leader nhóm đi reassign. Phát ở luồng `deactivate` của Users (Bước 5) — Users tiêu thụ
 * Notifier port của Tasks (chiều phụ thuộc Users→Tasks, build-plan §1), KHÔNG phát ngược lại.
 */
export interface TasksOrphanedEvent {
  deactivatedUserId: string;
  teamId: string;
  orphanedTaskCount: number;
}

/**
 * Notifier port — SEAM (src/tasks/CLAUDE.md). Bản nộp dùng `NoopNotifier` (không làm gì), portfolio
 * thay `EmailNotifier` báo assignee mới / báo leader. PHẢI phát event đúng điểm DÙ handler chưa làm
 * gì — không phát = sau này thêm email phải mổ lại lõi use-case / luồng deactivate.
 */
export interface Notifier {
  notifyReassigned(event: ReassignedEvent): Promise<void>;
  notifyTasksOrphaned(event: TasksOrphanedEvent): Promise<void>;
}
