import { ClassConstructor, plainToInstance } from 'class-transformer';

/**
 * Cổng cơ học 2 (base) — projection default-deny.
 * Chỉ field có `@Expose()` trên `cls` mới lộ ra; mọi field khác bị loại bỏ.
 * Đây là khuôn chung; response cụ thể (vd TaskResponse) + test field-cấm dựng ở Bước 4.
 */
export function project<T>(cls: ClassConstructor<T>, src: unknown): T {
  return plainToInstance(cls, src, { excludeExtraneousValues: true });
}
