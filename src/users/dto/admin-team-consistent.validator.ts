import { Role } from '@prisma/client';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * CHECK admin↔team đưa-lên-DTO (docs/06 §8.1/§9.2): `ADMIN ⇒ teamId vắng` · `LEADER/MEMBER ⇒ teamId có`.
 * Vi phạm → 400 VALIDATION_FAILED + details[] (cùng kiểu rule title-không-rỗng). Luật nghiệp vụ khác
 * (email trùng, leader đã tồn tại, team tồn tại) vẫn ở service.
 *
 * Treo trên `role` (LUÔN required, không @IsOptional) để validator luôn chạy và soi cả `teamId` —
 * nếu treo trên `teamId` có @IsOptional thì bị skip khi teamId undefined (xem at-least-one-of.validator.ts).
 */
export function AdminTeamConsistent(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'adminTeamConsistent',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const obj = args.object as { role?: Role; teamId?: unknown };
          const hasTeam =
            obj.teamId !== undefined &&
            obj.teamId !== null &&
            obj.teamId !== '';
          if (obj.role === Role.ADMIN) return !hasTeam;
          if (obj.role === Role.LEADER || obj.role === Role.MEMBER) {
            return hasTeam;
          }
          return true; // role lạ/thiếu → @IsEnum bắt riêng
        },
        defaultMessage(args: ValidationArguments): string {
          const role = (args.object as { role?: Role }).role;
          return role === Role.ADMIN
            ? 'ADMIN không được gán teamId.'
            : 'LEADER/MEMBER bắt buộc có teamId.';
        },
      },
    });
  };
}
