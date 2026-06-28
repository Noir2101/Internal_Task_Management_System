import { ForbiddenError, NotFoundError } from '../exceptions/domain.exception';

/**
 * Primitive cho convention keystone "miss→404 / predicate-fail→403" (docs/06 §3.2–3.3).
 * PURE (chỉ ném domain-exception, không `@nestjs/*`) → dùng được trong use-case lẫn `tasks/domain`.
 *
 * Đây CHỈ là khuôn dùng chung. scoped-load thật (repo lọc theo nhóm) realize ở Tasks (Bước 4);
 * mỗi module tự ghép `loadOr404` quanh lệnh load đã-scoped của mình, rồi `assertOr403` cho predicate.
 */

/** Bản ghi miss (load đã-scoped trả null) → ném NotFoundError (filter → 404 RESOURCE_NOT_FOUND). */
export function loadOr404<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) {
    throw new NotFoundError(message);
  }
  return value;
}

/** Predicate hành động fail → ném ForbiddenError với `code` cụ thể (filter → 403 + code). */
export function assertOr403(
  condition: boolean,
  code: string,
  message: string,
): void {
  if (!condition) {
    throw new ForbiddenError(code, message);
  }
}
