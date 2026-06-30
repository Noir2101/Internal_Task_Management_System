import { SetMetadata } from '@nestjs/common';

export const BREAK_GLASS_KEY = 'audit:break-glass';

/**
 * Đánh dấu một endpoint là break-glass (docs/06 §9.1/§9.4 — admin với tay vào chỗ vốn bị chặn).
 * `BreakGlassInterceptor` đọc metadata này để ghi MỘT dòng log {actor, action, target, time} ra
 * stdout mỗi lần gọi — mầm audit-log (MAINT-05), KHÔNG phải audit-log thật.
 *
 *   @BreakGlass('DELETE_TEAM')   // `action` đi vào dòng log
 *
 * `action` là một chuỗi ổn định (verb nghiệp vụ) để grep log; KHÔNG phải code FE-observable.
 */
export const BreakGlass = (action: string): MethodDecorator & ClassDecorator =>
  SetMetadata(BREAK_GLASS_KEY, action);
