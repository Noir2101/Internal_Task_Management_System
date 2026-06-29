import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AdminTeamConsistent } from './admin-team-consistent.validator';

/**
 * Body POST /users (docs/06 §8.1/§9.2). CHỈ validation hình thức + CHECK admin↔team (đưa-lên-DTO).
 * Luật nghiệp vụ (email trùng, leader đã có, team tồn tại, hash) ở service. `isActive`/`id`/`createdAt`
 * server-suy — KHÔNG vào body. Password policy: MinLength(8) (docs im lặng độ phức tạp — deviations-log Bước 5).
 */
export class CreateUserDto {
  @ApiProperty({ example: 'be.new@demo.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ maxLength: 200, example: 'Nguyễn Văn A' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ minLength: 8, example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  @AdminTeamConsistent()
  role: Role;

  @ApiPropertyOptional({
    description:
      'cuid2 — bắt buộc cho LEADER/MEMBER; vắng cho ADMIN (CHECK admin↔team)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  teamId?: string;
}
