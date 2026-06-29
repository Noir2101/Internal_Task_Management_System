import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body PATCH /teams/:id — đổi tên (§9.2). Chỉ `name`; tên-trùng (TEAM_NAME_TAKEN) ở service.
 * `forbidNonWhitelisted` (main.ts) tự loại field lạ.
 */
export class UpdateTeamDto {
  @ApiProperty({ maxLength: 200, example: 'Backend Core' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;
}
