import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { UserResponse } from './user.response';

/**
 * Response POST /users/:id/deactivate (docs/06 §9.3/§10): 200 {user, orphanedTaskCount}.
 * `user` = UserResponse ĐẦY ĐỦ (§9.3 ví dụ {id,isActive} chỉ minh hoạ — xem deviations-log Bước 5).
 * `orphanedTaskCount` = số task treo (chưa-DONE) còn gán cho user, để admin/leader thấy ngay.
 */
export class DeactivateUserResponse {
  @ApiProperty({ type: UserResponse })
  @Expose()
  @Type(() => UserResponse)
  user: UserResponse;

  @ApiProperty()
  @Expose()
  orphanedTaskCount: number;
}

/** Response POST /users/:id/reactivate (§9.3/§10): 200 {user}. `user` = UserResponse đầy đủ (vẫn MEMBER). */
export class ReactivateUserResponse {
  @ApiProperty({ type: UserResponse })
  @Expose()
  @Type(() => UserResponse)
  user: UserResponse;
}
