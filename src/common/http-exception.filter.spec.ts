import { ArgumentsHost } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from './exceptions/domain.exception';
import { HttpExceptionFilter } from './http-exception.filter';

/** Dựng ArgumentsHost tối thiểu + bắt body mà filter ghi ra. */
function makeHost(): {
  host: ArgumentsHost;
  captured: () => Record<string, unknown>;
} {
  let body: Record<string, unknown> = {};
  const res = {
    status: () => res,
    json: (b: Record<string, unknown>) => {
      body = b;
      return res;
    },
  };
  const req = {
    requestId: 'req_test',
    method: 'GET',
    originalUrl: '/api/v1/x',
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, captured: () => body };
}

describe('HttpExceptionFilter — map domain-exception (Bước 3)', () => {
  const filter = new HttpExceptionFilter();

  it('NotFoundError → 404 RESOURCE_NOT_FOUND, envelope đủ field', () => {
    const { host, captured } = makeHost();
    filter.catch(new NotFoundError(), host);
    const body = captured();

    expect(body.statusCode).toBe(404);
    expect(body.code).toBe('RESOURCE_NOT_FOUND');
    expect(body.error).toBe('Not Found');
    expect(body.requestId).toBe('req_test');
    expect(body.details).toBeUndefined();
  });

  it('ForbiddenError mang code cụ thể → 403 + code đó (vd FORBIDDEN cho /stats)', () => {
    const { host, captured } = makeHost();
    filter.catch(new ForbiddenError('FORBIDDEN', 'sai vai trò'), host);
    const body = captured();

    expect(body.statusCode).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(body.error).toBe('Forbidden');
    expect(body.requestId).toBe('req_test');
  });
});
