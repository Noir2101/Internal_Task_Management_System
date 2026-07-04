/**
 * seed-if-empty — GĐ10 Slice 1 deploy guard (docs/10-deploy-plan.md §5.1/§5.2).
 *
 * Reuses the exported `seedDatabase` (prisma/seed.ts) unchanged and wraps it with a guard:
 * seed ONLY when the database has no users. This turns the reset-style seed into an
 * idempotent startup step so restarts keep user data (NFR-DEPLOY-02) while a fresh volume
 * still gets demo fixtures (NFR-DEPLOY-03). It does NOT alter seed.ts's reset behavior.
 */
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../prisma/seed';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const count = await prisma.user.count();
    if (count > 0) {
      console.log(`[seed-if-empty] ${count} user(s) present — skipping seed.`);
      return;
    }
    console.log('[seed-if-empty] Empty database — seeding demo data...');
    await seedDatabase(prisma);
    console.log(
      '[seed-if-empty] Seed complete: 1 admin · 2 teams · 6 users · 8 tasks.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
