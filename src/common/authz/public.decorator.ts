import { SetMetadata } from '@nestjs/common';

/** Khoá metadata để `JwtAuthGuard` (global APP_GUARD) bỏ qua xác thực cho endpoint công khai. */
export const IS_PUBLIC_KEY = 'authz:public';

/**
 * Opt-out khỏi guard xác thực global. Dùng cho endpoint không cần Bearer:
 * `/auth/login`, `/auth/refresh`, `/auth/logout`, `/health`. Mọi endpoint khác mặc-định-bảo-vệ.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
