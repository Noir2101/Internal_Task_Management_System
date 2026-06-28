/** DI token cho Notifier. */
export const NOTIFIER = Symbol('NOTIFIER');

/** Event reassign — phát đúng điểm trong ReassignTask (seam). */
export interface ReassignedEvent {
  taskId: string;
  previousAssigneeId: string;
  newAssigneeId: string;
}

/**
 * Notifier port — SEAM (src/tasks/CLAUDE.md). Bản nộp dùng `NoopNotifier` (không làm gì), portfolio
 * thay `EmailNotifier` báo assignee mới. PHẢI phát event đúng điểm trong ReassignTask DÙ handler chưa
 * làm gì — không phát = sau này thêm email phải mổ lại lõi use-case.
 */
export interface Notifier {
  notifyReassigned(event: ReassignedEvent): Promise<void>;
}
