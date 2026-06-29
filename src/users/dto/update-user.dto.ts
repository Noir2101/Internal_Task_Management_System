import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body PATCH /users/:id — CHỈ `name` (docs/06 §8.1/§9.5: teamId & role BẤT BIẾN sau tạo).
 * role/teamId KHÔNG khai ⇒ `forbidNonWhitelisted` (main.ts) tự chặn nếu lọt vào body → enforce kép
 * bất biến §9.5 (chống mass-assignment). Role chỉ đổi qua leader-swap.
 */
export class UpdateUserDto {
  @ApiProperty({ maxLength: 200, example: 'Tên mới' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;
}
