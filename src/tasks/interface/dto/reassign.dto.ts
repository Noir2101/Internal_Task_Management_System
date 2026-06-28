import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Body PATCH /tasks/:id/assignee (docs/06 §8.1). Chỉ đổi assignee; owner giữ nguyên. */
export class ReassignDto {
  @ApiProperty({
    description: 'cuid2 — thành viên đang hoạt động trong nhóm',
  })
  @IsString()
  @IsNotEmpty()
  assigneeId: string;
}
