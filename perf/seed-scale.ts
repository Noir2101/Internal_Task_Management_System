/**
 * Seed quy mô tham chiếu (PERF-01) cho phép đo k6 — TÁCH BIỆT seed demo (prisma/seed.ts).
 * Nạp 10 nhóm · 50 user (1 leader + 4 member mỗi nhóm) · 5000 task (~500/nhóm, assignee trong nhóm).
 * GHI ĐÈ DB `itms` — chỉ là fixture đo tải, khôi phục bằng `npx tsx prisma/seed.ts`.
 * Chạy sau khi stack đã lên:
 *
 *   DATABASE_URL="postgresql://itms:itms@localhost:5433/itms?schema=public" \
 *     npx tsx perf/seed-scale.ts
 *
 * Leader creds cho k6: lead0@perf.local / Password123!  (thấy ~500 task trong scope nhóm 0).
 */
import { PrismaClient, Role, Progress } from '@prisma/client';
import * as argon2 from 'argon2';

// Tham số hoá qua env (mặc định = quy mô PERF-01 gốc). Để giữ scope leader-0 ~500 khi tăng TASKS,
// tăng TEAMS cùng tỉ lệ (vd 1M task ⇒ TEAMS=2000 ⇒ ~500/nhóm) — test "bảng nặng, query nhẹ scoped".
const TEAMS = Number(process.env.PERF_TEAMS ?? 10);
const MEMBERS_PER_TEAM = 4; // + 1 leader ⇒ 5/nhóm
const TASKS = Number(process.env.PERF_TASKS ?? 5000);
const PROGRESSES = [Progress.TODO, Progress.IN_PROGRESS, Progress.DONE];
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    // Reset theo thứ tự an toàn FK: con trước → cha
    await prisma.refreshToken.deleteMany();
    await prisma.task.deleteMany();
    await prisma.user.deleteMany();
    await prisma.team.deleteMany();

    const pw = await argon2.hash('Password123!'); // một hash, tái dùng cho mọi user (argon2 chậm)

    // Admin ngoài cây tổ chức (teamId null — khớp CHECK admin-no-team)
    await prisma.user.create({
      data: { email: 'admin@perf.local', name: 'Admin', role: Role.ADMIN, passwordHash: pw },
    });

    const teams: { leaderId: string; memberIds: string[]; teamId: string }[] = [];
    for (let t = 0; t < TEAMS; t++) {
      const team = await prisma.team.create({ data: { name: `Team ${t}` } });
      const leader = await prisma.user.create({
        data: { email: `lead${t}@perf.local`, name: `Leader ${t}`, role: Role.LEADER, teamId: team.id, passwordHash: pw },
      });
      const memberIds: string[] = [];
      for (let m = 0; m < MEMBERS_PER_TEAM; m++) {
        const u = await prisma.user.create({
          data: { email: `u${t}_${m}@perf.local`, name: `User ${t}-${m}`, role: Role.MEMBER, teamId: team.id, passwordHash: pw },
        });
        memberIds.push(u.id);
      }
      teams.push({ teamId: team.id, leaderId: leader.id, memberIds });
    }

    // 5000 task rải đều 10 nhóm; assignee là member trong nhóm; owner là leader nhóm đó.
    // Trộn tiến độ + deadline (một phần quá khứ ⇒ OVERDUE nếu chưa DONE) để filter có phân bố thật.
    const rows: {
      title: string;
      progress: Progress;
      ownerId: string;
      assigneeId: string;
      deadline: Date | null;
    }[] = [];
    for (let i = 0; i < TASKS; i++) {
      const g = teams[i % TEAMS];
      rows.push({
        title: `Task ${i} — ${['fix', 'build', 'design', 'review', 'test'][i % 5]} module`,
        progress: PROGRESSES[i % 3],
        ownerId: g.leaderId,
        assigneeId: g.memberIds[i % g.memberIds.length],
        deadline: i % 5 === 0 ? null : daysFromNow((i % 20) - 8), // ~80% có deadline, khoảng −8..+11 ngày
      });
    }

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await prisma.task.createMany({ data: rows.slice(i, i + CHUNK) });
      process.stdout.write(`\rInserted ${Math.min(i + CHUNK, rows.length)}/${rows.length} tasks`);
    }

    const [users, teamCount, tasks] = await Promise.all([
      prisma.user.count(),
      prisma.team.count(),
      prisma.task.count(),
    ]);
    const scope0 = await prisma.task.count({
      where: { assigneeId: { in: teams[0].memberIds }, deletedAt: null },
    });
    console.log(`\nSeeded: ${users} users · ${teamCount} teams · ${tasks} tasks`);
    console.log(`Leader 0 (lead0@perf.local) scope ⇒ ${scope0} tasks visible in GET /tasks`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
