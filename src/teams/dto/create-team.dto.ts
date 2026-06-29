import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body POST /teams (docs/06 §8.1). CHỈ validation hình thức; luật tên-trùng (TEAM_NAME_TAKEN) ở service.
 * `name` trim khác rỗng; MaxLength(200) là default formal (docs im lặng độ dài — xem deviations-log Bước 5).
 */
export class CreateTeamDto {
  @ApiProperty({ maxLength: 200, example: 'Backend' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;
}
