import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app-config';
import { ErrorEnvelopeResponse } from './common/dto/error-envelope.response';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Pipeline HTTP dùng chung với e2e (requestId, cookieParser, prefix, ValidationPipe, filter).
  configureApp(app);

  const config = new DocumentBuilder()
    .setTitle('Internal Task Management System API')
    .setDescription(
      'ITMS backend. Mọi lỗi trả về cùng một ' +
        'envelope (model `ErrorEnvelopeResponse`); frontend rẽ nhánh trên `code`.',
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
