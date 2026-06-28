import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Body POST /tasks (docs/06 §8.1). CHỈ validation hình thức; luật giao việc + past-deadline ở use-case.
 * `ownerId`/scope KHÔNG vào body (server-suy từ JWT — chống mass-assignment). `allowPastDeadline` là
 * cờ xác nhận, không ghi DB. `assigneeId` required cho cả member (chính mình) lẫn leader (§8.1).
 */
export class CreateTaskDto {
  @ApiProperty({ maxLength: 200, example: 'Migration prod' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

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

  @ApiProperty({
    description: 'cuid2 — member: chính mình; leader: thành viên trong nhóm',
  })
  @IsString()
  @IsNotEmpty()
  assigneeId: string;

  @ApiPropertyOptional({ description: 'Xác nhận đặt deadline ở quá khứ' })
  @IsOptional()
  @IsBoolean()
  allowPastDeadline?: boolean;
}
