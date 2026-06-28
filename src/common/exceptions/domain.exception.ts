/**
 * Domain-exception framework-agnostic. TÁCH khỏi `AppException` (file kia extends HttpException):
 * lớp này KHÔNG extend HttpException và KHÔNG import `@nestjs/*`, để `tasks/domain` ném được mà
 * không vỡ cổng 1 (ESLint domain purity). `HttpExceptionFilter` map chúng → envelope:
 *   - NotFoundError  → 404 RESOURCE_NOT_FOUND  (404 luôn dùng code chung, docs/06 §7.3)
 *   - ForbiddenError → 403 + `code` cụ thể (từ registry §7.3)
 * Hiện thực convention keystone "miss→404 / fail→403"; helper ở `common/authz/scoped.ts`.
 */

export abstract class DomainException extends Error {}

/** Tài nguyên ngoài phạm vi hoặc không tồn tại → 404 RESOURCE_NOT_FOUND (giấu tồn tại). */
export class NotFoundError extends DomainException {
  constructor(message = 'Không tìm thấy tài nguyên.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Thấy được nhưng hành động không phải của bạn → 403 + `code` cụ thể (docs/06 §7.3). */
export class ForbiddenError extends DomainException {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
