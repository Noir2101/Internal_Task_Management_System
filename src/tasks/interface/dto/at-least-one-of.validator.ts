import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Cross-field: object phải có ÍT NHẤT một trong `fields` khác `undefined`.
 * Treo trên một property dummy (KHÔNG `@IsOptional` — nếu không sẽ bị skip khi undefined),
 * nên validator luôn chạy và soi cả object. Dùng cho PATCH "ít nhất một field" (docs/06 §8.1).
 */
export function AtLeastOneOf(fields: string[], options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'atLeastOneOf',
      target: object.constructor,
      propertyName,
      constraints: [fields],
      options,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const [names] = args.constraints as [string[]];
          const obj = args.object as Record<string, unknown>;
          return names.some((n) => obj[n] !== undefined);
        },
        defaultMessage(args: ValidationArguments): string {
          const [names] = args.constraints as [string[]];
          return `Cần ít nhất một field: ${names.join(', ')}.`;
        },
      },
    });
  };
}
