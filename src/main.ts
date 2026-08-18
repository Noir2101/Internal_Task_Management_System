// PHẢI là import đầu tiên (GĐ11 slice 2, docs/11 §6). `tasks.module.ts` đọc `REDIS_URL` lúc dựng
// metadata module, và thời điểm đó xảy ra TRƯỚC khi `ConfigModule.forRoot()` trong `app.module.ts`
// nạp `.env`. Không có dòng này thì `REDIS_URL` đặt trong `.env` bật được throttle store của slice 1
// nhưng lại im lặng không bật queue — cùng một biến mà hai cơ chế hiểu khác nhau.
import 'dotenv/config';
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
