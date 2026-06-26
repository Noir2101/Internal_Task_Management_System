import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Phép chiếu user cho response auth (docs/06 §6.2): ĐÚNG 4 field {id,name,role,teamId}.
 * KHÁC projection User đầy đủ §8.2 (không email/isActive/createdAt) — chủ đích, đây là
 * danh tính tối thiểu để FE render. Map qua project() (cổng 2): chỉ field @Expose mới lộ,
 * nên passwordHash/... không bao giờ lọt dù truyền cả model Prisma vào.
 */
export class AuthUserResponse {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty({ enum: Role })
  @Expose()
  role: Role;

  @ApiProperty({ nullable: true, type: String })
  @Expose()
  teamId: string | null;
}
