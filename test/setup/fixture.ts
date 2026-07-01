import * as argon2 from 'argon2';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SEED_PASSWORD, seedDatabase, SeedHandles } from '../../prisma/seed';

/** Hash argon2 tính MỘT lần cho cả run (argon2 chậm ~100ms) → reseed per-test không cộng dồn chi phí. */
let cachedHash: string | undefined;

/**
 * Truncate + reseed ma trận fixture về trạng thái sạch, trả handle (ID) cho test assert. Gọi ở
 * beforeEach mỗi spec → mỗi test độc lập hoàn toàn. `seedDatabase` tự reset (deleteMany) trước khi tạo.
 */
export async function resetAndSeed(
  prisma: PrismaService,
): Promise<SeedHandles> {
  cachedHash ??= await argon2.hash(SEED_PASSWORD);
  return seedDatabase(prisma, { passwordHash: cachedHash });
}
