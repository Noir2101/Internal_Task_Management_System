import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';

/**
 * Lỗi auth → envelope (tái dùng base Bước 1). Mọi `code` nằm trong registry docs/06 §7.3.
 * Filter xử lý AppException trước nên status/code/message đi thẳng vào envelope 7-field.
 * `message` không phải hợp đồng (FE rẽ nhánh trên `code`) — đổi/dịch tự do.
 */

/** 401 — sai email HOẶC mật khẩu. Message chung, KHÔNG lộ email tồn tại (§6.3). */
export class InvalidCredentialsException extends AppException {
  constructor() {
    super(
      'INVALID_CREDENTIALS',
      HttpStatus.UNAUTHORIZED,
      'Email hoặc mật khẩu không đúng.',
    );
  }
}

/** 403 — password đúng nhưng tài khoản bị vô hiệu hoá (chỉ lộ sau khi pass đúng, §6.3). */
export class AccountDisabledException extends AppException {
  constructor() {
    super(
      'ACCOUNT_DISABLED',
      HttpStatus.FORBIDDEN,
      'Tài khoản đã bị vô hiệu hoá.',
    );
  }
}

/**
 * 401 — gộp MỌI ca lỗi refresh: thiếu/không thấy/đã thu hồi/hết hạn/REUSE (§6.2).
 * Reuse KHÔNG có code riêng (chủ đích) — kẻ trộm không biết đã kích detection.
 */
export class SessionExpiredException extends AppException {
  constructor() {
    super(
      'SESSION_EXPIRED',
      HttpStatus.UNAUTHORIZED,
      'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
    );
  }
}

/** 401 — access token hết hạn (§6.4). FE gọi /auth/refresh rồi thử lại một lần. */
export class TokenExpiredException extends AppException {
  constructor() {
    super('TOKEN_EXPIRED', HttpStatus.UNAUTHORIZED, 'Access token đã hết hạn.');
  }
}

/** 401 — access token hỏng/sai chữ ký/thiếu (§6.4). */
export class TokenInvalidException extends AppException {
  constructor() {
    super(
      'TOKEN_INVALID',
      HttpStatus.UNAUTHORIZED,
      'Access token không hợp lệ.',
    );
  }
}
