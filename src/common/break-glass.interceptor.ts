import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { BREAK_GLASS_KEY } from './authz/break-glass.decorator';

/**
 * Ghi log seam cho endpoint break-glass (docs/06 §9.4 "một interceptor ghi log"). Mỗi lần gọi (đã
 * qua admin-guard) ghi MỘT dòng JSON {actor, action, target, at} ở mức `warn` ra stdout — log NGAY
 * khi vào (trước `next.handle()`) nên cả lần bị 409 (nhóm còn member) cũng được ghi lại.
 *
 * Đây là MẦM audit-log (MAINT-05), KHÔNG phải audit-log thật: không bảng, không ghi DB. Seam tái dùng
 * được — endpoint break-glass kế tiếp chỉ cần `@BreakGlass('ACTION')` + interceptor này.
 */
@Injectable()
export class BreakGlassInterceptor implements NestInterceptor {
  private readonly logger = new Logger('BreakGlass');

  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<string | undefined>(
      BREAK_GLASS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (action) {
      const req = ctx.switchToHttp().getRequest<Request>();
      this.logger.warn(
        JSON.stringify({
          actor: req.user?.sub ?? 'unknown',
          action,
          target: req.params?.id ?? null,
          at: new Date().toISOString(),
        }),
      );
    }
    return next.handle();
  }
}
