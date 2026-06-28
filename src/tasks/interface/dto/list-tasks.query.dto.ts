import { ApiPropertyOptional } from '@nestjs/swagger';
import { Progress } from '@prisma/client';
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
 * Query GET /tasks (docs/06 §4.1). KHÔNG có `teamId` (scope server-suy). Mọi filter AND nhau.
 * `overdue` là trục RIÊNG (không phải giá trị progress). Query param là string → @Type/@Transform ép kiểu.
 */
export class ListTasksQueryDto {
  @ApiPropertyOptional({ enum: Progress })
  @IsOptional()
  @IsEnum(Progress)
  progress?: Progress;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'true: chỉ quá hạn; false: chỉ chưa; bỏ trống: tất cả',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'Lọc theo người được giao (cuid2)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Tìm ILIKE trên title và description' })
  @IsOptional()
  @IsString()
  q?: string;

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
