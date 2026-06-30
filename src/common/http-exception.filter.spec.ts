import { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

describe('HttpExceptionFilter — Prisma-error safety-net (Bước 7, docs/06 §7.4)', () => {
  const filter = new HttpExceptionFilter();

  const prismaError = (code: string, meta?: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError('db constraint', {
      code,
      clientVersion: 'test',
      meta,
    });

  // [code Prisma, meta, status mong đợi, code envelope] — khoá bảng map mà KHÔNG cần DB.
  const cases: [string, Record<string, unknown> | undefined, number, string][] =
    [
      ['P2002', { target: ['email'] }, 409, 'EMAIL_TAKEN'],
      ['P2002', { target: 'User_email_key' }, 409, 'EMAIL_TAKEN'],
      ['P2002', { target: 'Team_name_key' }, 409, 'TEAM_NAME_TAKEN'],
      [
        'P2002',
        { target: 'user_one_leader_per_team' },
        409,
        'LEADER_ALREADY_EXISTS',
      ],
      ['P2003', { field_name: 'User_teamId_fkey' }, 409, 'TEAM_NOT_EMPTY'],
      ['P2025', undefined, 404, 'RESOURCE_NOT_FOUND'],
      // target không phân biệt được / code lạ → 500, KHÔNG bịa code 409 chung
      ['P2002', { target: ['tokenHash'] }, 500, 'INTERNAL_ERROR'],
      ['P2002', undefined, 500, 'INTERNAL_ERROR'],
      ['P2010', undefined, 500, 'INTERNAL_ERROR'],
    ];

  it.each(cases)(
    '%s target=%o → %d %s',
    (code, meta, expectedStatus, expectedCode) => {
      const { host, captured } = makeHost();
      filter.catch(prismaError(code, meta), host);
      const body = captured();

      expect(body.statusCode).toBe(expectedStatus);
      expect(body.code).toBe(expectedCode);
      expect(body.requestId).toBe('req_test');
      expect(body.details).toBeUndefined(); // details[] CHỈ ở VALIDATION_FAILED
    },
  );
});
