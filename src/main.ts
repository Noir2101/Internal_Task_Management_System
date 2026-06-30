import { ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ErrorEnvelopeResponse } from './common/dto/error-envelope.response';
import {
  ErrorDetail,
  ValidationException,
} from './common/exceptions/app.exception';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';

/** Phẳng hoá lỗi class-validator → details[] {field, constraint} cho VALIDATION_FAILED. */
function flattenValidationErrors(errors: ValidationError[]): ErrorDetail[] {
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

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  const config = new DocumentBuilder()
    .setTitle('Internal Task Management System API')
    .setDescription(
      'ITMS backend — GĐ7. Hợp đồng: docs/06-api-contract.md. Mọi lỗi trả về cùng một ' +
        'envelope (model `ErrorEnvelopeResponse`); FE rẽ nhánh trên `code` (registry §7.3). ' +
        'Lưu ý: Swagger để mở ở đây là lựa chọn DEMO — prod nên gate sau cờ môi trường (§11).',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  // `extraModels`: đăng ký envelope lỗi MỘT lần để schema xuất hiện trong components dù không endpoint
  // nào tham chiếu trực tiếp (docs/06 §11 — envelope dùng lại một chỗ).
  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorEnvelopeResponse],
  });
  SwaggerModule.setup('api/v1/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
