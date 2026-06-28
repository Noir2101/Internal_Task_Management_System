import { ApiProperty } from '@nestjs/swagger';
import { Progress } from '@prisma/client';
import { IsEnum } from 'class-validator';

/** Body PATCH /tasks/:id/progress. any→any, KHÔNG máy trạng thái (docs/06 §4.3). */
export class UpdateProgressDto {
  @ApiProperty({ enum: Progress })
  @IsEnum(Progress)
  progress: Progress;
}
