import { ValidationError, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import {
  ErrorDetail,
  ValidationException,
} from './common/exceptions/app.exception';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';

/** Phẳng hoá lỗi class-validator → details[] {field, constraint} cho VALIDATION_FAILED. */
export function flattenValidationErrors(
  errors: ValidationError[],
): ErrorDetail[] {
  const out: ErrorDetail[] = [];
  const walk = (errs: ValidationError[], parent = ''): void => {
    for (const e of errs) {
      const field = parent ? `${parent}.${e.property}` : e.property;
      if (e.constraints) {
        for (const constraint of Object.values(e.constraints)) {
          out.push({ field, constraint });
        }
      }
      if (e.children?.length) walk(e.children, field);
    }
  };
  walk(errors);
  return out;
}

/**
 * Cấu hình pipeline HTTP dùng CHUNG cho prod (`main.ts`) và e2e (`test/setup/test-app.ts`). Gom mọi
 * global vào một chỗ để e2e chạy ĐÚNG stack của prod — envelope, validation, requestId không drift.
 * KHÔNG gồm Swagger (chỉ prod cần) và không gọi `listen` (test dùng supertest trên instance).
 */
export function configureApp(app: NestExpressApplication): void {
  // Tin proxy 1 hop (§6.4 throttle keyed theo IP): prod same-origin chạy sau reverse-proxy → `req.ip`
  // lấy từ X-Forwarded-For của hop tin cậy, không phải IP proxy. Dev không proxy nên vô hại.
  app.set('trust proxy', 1);

  // requestId chạy sớm nhất, trước routing → có mặt cả ở 404.
  app.use(requestIdMiddleware);
  // Parse Cookie header → req.cookies (refresh token đọc ở /auth/refresh, /auth/logout).
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new ValidationException(flattenValidationErrors(errors)),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
}
