import { ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
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
  const app = await NestFactory.create(AppModule);

  // requestId chạy sớm nhất, trước routing → có mặt cả ở 404.
  app.use(requestIdMiddleware);

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
    .setDescription('ITMS backend — GĐ7. Hợp đồng: docs/06-api-contract.md')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
