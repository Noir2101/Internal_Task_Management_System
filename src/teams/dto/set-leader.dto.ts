import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body PUT /teams/:id/leader (docs/06 §8.1). Chỉ `userId` (cuid2). Luật "member đang hoạt động của
 * nhóm" + swap atomic ở service (§9.3). `teamId` lấy từ URL, KHÔNG vào body.
 */
export class SetLeaderDto {
  @ApiProperty({ description: 'cuid2 — member đang hoạt động của nhóm' })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
