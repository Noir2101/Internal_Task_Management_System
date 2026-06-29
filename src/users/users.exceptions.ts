import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';

/**
 * Lỗi nghiệp vụ Users → envelope (khuôn auth.exceptions.ts). Mọi `code` ∈ registry docs/06 §7.3/§7.4.
 * Filter xử lý AppException trước nên status/code/message đi thẳng vào envelope 7-field.
 * Tất cả là 409 (xung đột trạng thái — §7.5). `message` không phải hợp đồng (FE rẽ nhánh trên `code`).
 */

/** 409 — email trùng (unique DB; domain pre-check trước, P2002 safety-net để Bước 7). §7.4. */
export class EmailTakenException extends AppException {
  constructor() {
    super('EMAIL_TAKEN', HttpStatus.CONFLICT, 'Email đã được sử dụng.');
  }
}

/** 409 — tạo role=LEADER cho nhóm đã có leader (buộc dùng PUT /teams/:id/leader). §9.2/§7.4. */
export class LeaderAlreadyExistsException extends AppException {
  constructor() {
    super(
      'LEADER_ALREADY_EXISTS',
      HttpStatus.CONFLICT,
      'Nhóm đã có leader — dùng PUT /teams/:id/leader để đổi.',
    );
  }
}

/** 409 — deactivate một leader chưa có người thay (phải swap leader trước). §9.3/§7.4. */
export class LeaderReplacementRequiredException extends AppException {
  constructor() {
    super(
      'LEADER_REPLACEMENT_REQUIRED',
      HttpStatus.CONFLICT,
      'Phải chỉ định leader thay trước khi vô hiệu hoá.',
    );
  }
}

/** 409 — admin tự vô hiệu hoá chính mình (chống tự khoá). §9.3. */
export class CannotDisableSelfException extends AppException {
  constructor() {
    super(
      'CANNOT_DISABLE_SELF',
      HttpStatus.CONFLICT,
      'Không thể tự vô hiệu hoá chính mình.',
    );
  }
}

/** 409 — vô hiệu hoá admin đang hoạt động cuối cùng (chống khoá hệ thống). §9.3. */
export class LastAdminException extends AppException {
  constructor() {
    super(
      'LAST_ADMIN',
      HttpStatus.CONFLICT,
      'Không thể vô hiệu hoá admin đang hoạt động cuối cùng.',
    );
  }
}
