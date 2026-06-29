import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Query GET /users (docs/06 §9.2): lọc role/teamId/includeInactive + phân trang. Default scope loại
 * user inactive (CLAUDE.md lifecycle) trừ khi includeInactive=true. Query param là string → @Type/@Transform ép kiểu.
 * Phân trang + sort khớp Tasks §4.1/§4.2 (page≥1 default 1; limit default 20 trần 100; createdAt DESC, id DESC).
 */
export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ description: 'Lọc theo nhóm (cuid2)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  teamId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true: gồm cả user đã vô hiệu hoá; mặc định false (chỉ active)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeInactive?: boolean;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
