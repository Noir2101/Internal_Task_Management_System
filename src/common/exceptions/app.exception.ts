import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorDetail {
  field: string;
  constraint: string;
}

/**
 * Base cho mọi lỗi nghiệp vụ map sang envelope. Mang `code` (machine key của hợp đồng,
 * docs/06 §7.3) — phần frontend rẽ nhánh. Seam mỏng cho Bước 1; NotFound/Forbidden
 * domain + các lỗi 403/409 cụ thể thêm ở các bước sau.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: string,
    status: HttpStatus,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message, status);
  }
}

/** 400 VALIDATION_FAILED — chỗ DUY NHẤT được kèm `details[]` (docs/06 §7.2). */
export class ValidationException extends AppException {
  constructor(details: ErrorDetail[], message = 'Dữ liệu không hợp lệ.') {
    super('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, message, details);
  }
}
