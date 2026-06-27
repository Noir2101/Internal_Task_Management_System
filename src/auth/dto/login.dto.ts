import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * Body của POST /auth/login. CHỈ validation hình thức ở rìa (docs/06 §8.1) —
 * KHÔNG policy mật khẩu ở đây (đây là login, không phải tạo user). Luật nghiệp vụ
 * (thứ tự kiểm, isActive) nằm ở use-case. Sai hình thức → 400 VALIDATION_FAILED + details[].
 */
export class LoginDto {
  @ApiProperty({ example: 'be.lead@demo.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
