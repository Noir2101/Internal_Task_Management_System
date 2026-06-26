import 'reflect-metadata';
import { Expose } from 'class-transformer';
import { project } from './projection';

class SampleResponse {
  @Expose() id: string;
  @Expose() name: string;
}

describe('project — cổng projection default-deny', () => {
  it('chỉ giữ field có @Expose, loại mọi field không khai báo', () => {
    const res = project(SampleResponse, {
      id: 'x',
      name: 'N',
      secret: 'should-not-leak',
      passwordHash: 'H',
    });

    expect(res.id).toBe('x');
    expect(res.name).toBe('N');
    expect((res as Record<string, unknown>).secret).toBeUndefined();
    expect((res as Record<string, unknown>).passwordHash).toBeUndefined();
  });
});
