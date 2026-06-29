import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Phép chiếu User (docs/06 §8.2): ĐÚNG 7 field {id,email,name,role,teamId,isActive,createdAt}.
 * KHÔNG updatedAt, KHÔNG passwordHash. Map qua project() (cổng 2 default-deny): chỉ field @Expose
 * mới lộ — passwordHash không bao giờ lọt dù truyền cả model Prisma vào.
 */
export class UserResponse {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  email: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty({ enum: Role })
  @Expose()
  role: Role;

  @ApiProperty({ nullable: true, type: String })
  @Expose()
  teamId: string | null;

  @ApiProperty()
  @Expose()
  isActive: boolean;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}
