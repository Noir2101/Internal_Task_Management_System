import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AtLeastOneOf } from './at-least-one-of.validator';

/**
 * Body PATCH /tasks/:id — sửa định nghĩa (docs/06 §8.1). CHỈ validation hình thức; luật owner +
 * past-deadline ở use-case. Field absent ⇒ giữ nguyên; `null` (description/deadline) ⇒ set null.
 * `allowPastDeadline` KHÔNG phải field của task — chỉ là cờ xác nhận, không ghi DB.
 */
export class UpdateTaskDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'ISO-8601 UTC hoặc null',
  })
  @IsOptional()
  @IsISO8601()
  deadline?: string | null;

  @ApiPropertyOptional({ description: 'Xác nhận đặt deadline ở quá khứ' })
  @IsOptional()
  @IsBoolean()
  allowPastDeadline?: boolean;

  /** Dummy treo cross-field "ít nhất một field" — không map từ body. */
  @AtLeastOneOf(['title', 'description', 'deadline'])
  readonly _present?: undefined;
}
