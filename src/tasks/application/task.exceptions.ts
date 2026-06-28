import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';

/**
 * 400 PAST_DEADLINE_CONFIRMATION_REQUIRED (docs/06 §7.4) — deadline quá khứ mà thiếu cờ
 * `allowPastDeadline`. Là lỗi MỨC PAYLOAD nên 400 (không 409): "xác nhận rồi gửi lại".
 * Dùng AppException (filter xử lý trước, status/code/message đi thẳng vào envelope).
 *
 * Các lỗi 403 record-level (NOT_TASK_OWNER…) KHÔNG cần class — ném qua `assertOr403(cond, code, msg)`
 * (ForbiddenError domain → filter → 403 + code).
 */
export class PastDeadlineConfirmationRequiredException extends AppException {
  constructor() {
    super(
      'PAST_DEADLINE_CONFIRMATION_REQUIRED',
      HttpStatus.BAD_REQUEST,
      'Deadline ở quá khứ — cần xác nhận (allowPastDeadline) để tiếp tục.',
    );
  }
}
