import { ApiError } from '../../lib/error';

/**
 * Human message for a task mutation failure, branched ONLY on `code` (docs/09 §3.4). Forms handle
 * VALIDATION_FAILED (→ field errors) and PAST_DEADLINE_CONFIRMATION_REQUIRED (→ confirm dialog)
 * before this fallback runs, so those are not special-cased here. A code outside the registry falls
 * to the generic message rather than crashing the UI.
 */
export function taskActionErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  }
  switch (err.code) {
    case 'NOT_TASK_OWNER':
    case 'NOT_TASK_ASSIGNEE':
    case 'TASK_MEMBER_SELF_ASSIGN_ONLY':
    case 'TASK_ASSIGNEE_NOT_IN_TEAM':
    case 'INSUFFICIENT_ROLE':
      // Permission raced ahead of the UI (role/team changed) — resync after showing this.
      return 'Bạn không có quyền thực hiện thao tác này.';
    case 'RESOURCE_NOT_FOUND':
      return 'Không tìm thấy công việc (có thể đã bị xoá hoặc ngoài phạm vi).';
    case 'RATE_LIMITED':
      return 'Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.';
    default:
      return 'Thao tác thất bại. Vui lòng thử lại.';
  }
}
