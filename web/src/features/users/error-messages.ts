import { ApiError } from '../../lib/error';

/**
 * Human message for a user-admin mutation failure, branched ONLY on `code` (docs/09 §3.4). Forms
 * handle VALIDATION_FAILED (→ field errors) and EMAIL_TAKEN (→ email field) before this fallback.
 * Wrong-role access is 404 RESOURCE_NOT_FOUND (hide), not 403, on this admin surface.
 */
export function userActionErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  }
  switch (err.code) {
    case 'EMAIL_TAKEN':
      return 'Email này đã được sử dụng.';
    case 'LEADER_ALREADY_EXISTS':
      return 'Nhóm đã có trưởng nhóm. Hãy dùng chức năng đổi trưởng nhóm ở trang nhóm.';
    case 'LEADER_REPLACEMENT_REQUIRED':
      return 'Không thể vô hiệu hoá trưởng nhóm khi chưa có người thay. Hãy đổi trưởng nhóm trước.';
    case 'CANNOT_DISABLE_SELF':
      return 'Bạn không thể tự vô hiệu hoá tài khoản của chính mình.';
    case 'LAST_ADMIN':
      return 'Không thể vô hiệu hoá admin đang hoạt động cuối cùng.';
    case 'RESOURCE_NOT_FOUND':
      return 'Không tìm thấy người dùng (hoặc nhóm không tồn tại).';
    case 'RATE_LIMITED':
      return 'Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.';
    default:
      return 'Thao tác thất bại. Vui lòng thử lại.';
  }
}
