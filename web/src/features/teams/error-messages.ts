import { ApiError } from '../../lib/error';

/**
 * Human message for a team-admin mutation failure, branched ONLY on `code` (docs/09 §3.4). The name
 * dialogs handle TEAM_NAME_TAKEN (→ name field) and VALIDATION_FAILED before this fallback.
 * Note: LEADER_NOT_TEAM_MEMBER is a 400 WITHOUT details[] (not a field error) — it lands here.
 */
export function teamActionErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  }
  switch (err.code) {
    case 'TEAM_NAME_TAKEN':
      return 'Tên nhóm này đã tồn tại.';
    case 'LEADER_NOT_TEAM_MEMBER':
      return 'Người được chọn không phải thành viên đang hoạt động của nhóm.';
    case 'TEAM_NOT_EMPTY':
      return 'Nhóm vẫn còn thành viên nên không thể giải thể.';
    case 'RESOURCE_NOT_FOUND':
      return 'Không tìm thấy nhóm.';
    case 'RATE_LIMITED':
      return 'Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.';
    default:
      return 'Thao tác thất bại. Vui lòng thử lại.';
  }
}
