import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';

/**
 * Lỗi nghiệp vụ Teams → envelope (khuôn auth.exceptions.ts). Mọi `code` ∈ registry docs/06 §7.3/§7.4.
 * Filter xử lý AppException trước nên status/code/message đi thẳng vào envelope 7-field.
 * `message` không phải hợp đồng (FE rẽ nhánh trên `code`) — đổi/dịch tự do.
 */

/** 409 — tên nhóm trùng (unique DB; domain pre-check trước, P2002 safety-net để Bước 7). §7.4. */
export class TeamNameTakenException extends AppException {
  constructor() {
    super('TEAM_NAME_TAKEN', HttpStatus.CONFLICT, 'Tên nhóm đã tồn tại.');
  }
}

/**
 * 400 — userId đặt-leader không phải member đang hoạt động của nhóm (§7.4/§10 — là 400, KHÔNG 409).
 * 400 business không kèm `details[]` (details chỉ ở VALIDATION_FAILED) — như PastDeadline... ở Tasks.
 */
export class LeaderNotTeamMemberException extends AppException {
  constructor() {
    super(
      'LEADER_NOT_TEAM_MEMBER',
      HttpStatus.BAD_REQUEST,
      'Người được đặt làm leader phải là thành viên đang hoạt động của nhóm.',
    );
  }
}

/**
 * 409 — break-glass DELETE /teams/:id còn member (§9.4/§10). "Empty" = KHÔNG còn User nào trỏ teamId
 * (active hay inactive đều chặn — FK Restrict + teamId bất biến §9.5). Domain pre-check (count) trước;
 * P2003 (đua: thêm member giữa check và delete) là safety-net từ filter Bước 7. §7.3/§10 đã có code.
 */
export class TeamNotEmptyException extends AppException {
  constructor() {
    super(
      'TEAM_NOT_EMPTY',
      HttpStatus.CONFLICT,
      'Nhóm vẫn còn thành viên — phải dọn hết trước khi giải thể.',
    );
  }
}
