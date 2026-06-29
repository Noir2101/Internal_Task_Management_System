import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Phép chiếu Team (docs/06 §8.2 KHÔNG định nghĩa Team projection → chốt {id,name,createdAt},
 * mirror UserResponse, bỏ updatedAt — xem deviations-log Bước 5). Map qua project() (cổng 2):
 * chỉ field @Expose mới lộ. PUT /teams/:id/leader cũng trả shape này (Team không có cột leader).
 */
export class TeamResponse {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}

/**
 * Brief thành viên cho roster GET /teams/:id/members (§8.2 không định nghĩa → chốt {id,name},
 * nhất quán owner/assignee/stats — đủ để leader giao việc). KHÔNG lộ email/role/isActive.
 */
export class MemberBrief {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;
}
