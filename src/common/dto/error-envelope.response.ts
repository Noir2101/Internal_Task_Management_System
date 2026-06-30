import { ApiProperty } from '@nestjs/swagger';

/** Một phần tử của `details[]` — CHỈ xuất hiện ở VALIDATION_FAILED (docs/06 §7.2). */
export class ErrorDetailResponse {
  @ApiProperty({ example: 'email' })
  field: string;

  @ApiProperty({ example: 'phải là email hợp lệ' })
  constraint: string;
}

/**
 * Envelope lỗi thống nhất (docs/06 §7.1) — khai báo MỘT lần qua `@ApiExtraModels`/`extraModels` rồi
 * dùng lại ở mọi nơi. FE rẽ nhánh CHỈ trên `code` (registry §7.3); `message` cho người đọc (đừng parse);
 * `details[]` CHỈ có ở VALIDATION_FAILED (§7.2). Đây là model TÀI LIỆU — `HttpExceptionFilter` mới là
 * chỗ DUY NHẤT dựng envelope thật (cổng 2 projection không liên quan: không serialize model Prisma).
 */
export class ErrorEnvelopeResponse {
  @ApiProperty({ example: 409, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({
    example: 'Conflict',
    description:
      'Reason-phrase HTTP — chỉ để người đọc, FE KHÔNG rẽ nhánh trên field này',
  })
  error: string;

  @ApiProperty({
    example: 'TEAM_NOT_EMPTY',
    description:
      'Machine key — phần hợp đồng ổn định, FE rẽ nhánh ở đây (registry §7.3)',
  })
  code: string;

  @ApiProperty({
    example: 'Nhóm vẫn còn thành viên — phải dọn hết trước khi giải thể.',
    description: 'Thông điệp cho người đọc — đổi/dịch tự do, FE KHÔNG parse',
  })
  message: string;

  @ApiProperty({
    type: [ErrorDetailResponse],
    required: false,
    description:
      'CHỈ kèm ở VALIDATION_FAILED (§7.2); các lỗi khác không có field này',
  })
  details?: ErrorDetailResponse[];

  @ApiProperty({
    example: '2026-06-30T10:00:00.000Z',
    description: 'ISO-8601 UTC',
  })
  timestamp: string;

  @ApiProperty({ example: '/api/v1/teams/ckx0a1b2c3d4e5f6g7h8i9j0k' })
  path: string;

  @ApiProperty({
    example: 'req_ckx0a1b2c3d4e5f6g7h8i9j0k',
    description: 'Để dò log server cho lỗi 500',
  })
  requestId: string;
}
