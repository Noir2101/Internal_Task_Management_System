import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** Các env bắt buộc khi bật mail — thiếu bất kỳ cái nào là fail-fast. */
const REQUIRED_ENV = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM',
] as const;

/**
 * Đọc SMTP config từ env rồi tạo một nodemailer Transporter. nodemailer là lớp transport chung;
 * provider prod = Resend (host `smtp.resend.com`), đổi provider = đổi env chứ không đổi code.
 *
 * FAIL-FAST: nếu `MAIL_ENABLED=true` mà thiếu bất kỳ env nào ở `REQUIRED_ENV` thì THROW ngay lúc
 * module init — không im lặng chạy rồi mới phát hiện email không đi. Gọi qua factory ở tasks.module.
 */
export function createSmtpTransport(config: ConfigService): Transporter {
  const missing = REQUIRED_ENV.filter((key) => !config.get<string>(key));
  if (missing.length > 0) {
    throw new Error(
      `MAIL_ENABLED=true nhưng thiếu env: ${missing.join(', ')}. ` +
        `Đặt đủ SMTP_* + MAIL_FROM trong .env hoặc tắt MAIL_ENABLED.`,
    );
  }

  const port = Number(config.get<string>('SMTP_PORT'));
  return nodemailer.createTransport({
    host: config.get<string>('SMTP_HOST'),
    port,
    // 465 = TLS trực tiếp; 587 = STARTTLS (secure=false, nodemailer tự nâng cấp).
    secure: config.get<string>('SMTP_SECURE') === 'true' || port === 465,
    auth: {
      user: config.get<string>('SMTP_USER'),
      pass: config.get<string>('SMTP_PASS'),
    },
  });
}
