import { PrismaClient, Role, Progress, Team, Task, User } from '@prisma/client';
import * as argon2 from 'argon2'; // npm i argon2 (khớp hashing của auth service)

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

/** Mật khẩu dev/demo dùng chung cho mọi seed user — CHỈ dev/demo, không phải secret prod. */
export const SEED_PASSWORD = 'Password123!';

/** Handle mọi entity seed — để e2e tham chiếu ID mà không phải query lại. */
export interface SeedHandles {
  password: string;
  admin: User;
  teams: { backend: Team; frontend: Team };
  users: { beLead: User; beA: User; beB: User; feLead: User; feA: User };
  tasks: {
    designSchema: Task; // DONE, quá hạn, assignee beA — DONE ⇒ KHÔNG overdue
    writeAuth: Task; // IN_PROGRESS, tương lai, beA
    seedData: Task; // TODO, tương lai, beB
    migrationProd: Task; // IN_PROGRESS, quá hạn, beB — OVERDUE
    fixBug500: Task; // TODO, quá hạn, beA — OVERDUE
    readPrismaDocs: Task; // TODO, không deadline, beA (owner=assignee, member tự tạo)
    deletedTask: Task; // soft-deleted, beB — loại khỏi default scope
    feLayout: Task; // IN_PROGRESS, quá hạn, feA (nhóm FE) — OVERDUE
  };
}

/**
 * Seed ma trận fixture (reset trước, tạo sau). Nguồn sự thật DUY NHẤT của fixture, dùng bởi CẢ
 * `npm run seed` (CLI wrapper dưới) LẪN e2e (reseed per-test). `opts.passwordHash` cho phép e2e
 * truyền hash đã cache (argon2 chậm) — bỏ trống thì tự hash `SEED_PASSWORD`. Hành vi reset+data
 * giữ NGUYÊN như bản CLI cũ: 1 admin · 2 nhóm · 6 user · 8 task.
 */
export async function seedDatabase(
  prisma: PrismaClient,
  opts: { passwordHash?: string } = {},
): Promise<SeedHandles> {
  // Reset theo thứ tự an toàn FK: con trước (RefreshToken, Task) → cha (User, Team)
  await prisma.refreshToken.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  const pw = opts.passwordHash ?? (await argon2.hash(SEED_PASSWORD));

  // 1 admin — ngoài cây tổ chức (teamId null; CHECK: ADMIN ⟺ teamId NULL)
  const admin = await prisma.user.create({
    data: {
      email: 'admin@demo.local',
      name: 'Admin',
      role: Role.ADMIN,
      passwordHash: pw,
    },
  });

  // 2 nhóm — để minh hoạ team-scoping (leader BE không thấy task FE)
  const backend = await prisma.team.create({ data: { name: 'Backend' } });
  const frontend = await prisma.team.create({ data: { name: 'Frontend' } });

  const mkUser = (email: string, name: string, role: Role, teamId: string) =>
    prisma.user.create({
      data: { email, name, role, teamId, passwordHash: pw },
    });

  // Mỗi nhóm đúng 1 LEADER (partial unique) + member
  const beLead = await mkUser(
    'be.lead@demo.local',
    'Bích (BE lead)',
    Role.LEADER,
    backend.id,
  );
  const beA = await mkUser('be.a@demo.local', 'An (BE)', Role.MEMBER, backend.id);
  const beB = await mkUser('be.b@demo.local', 'Bảo (BE)', Role.MEMBER, backend.id);
  const feLead = await mkUser(
    'fe.lead@demo.local',
    'Linh (FE lead)',
    Role.LEADER,
    frontend.id,
  );
  const feA = await mkUser('fe.a@demo.local', 'Hà (FE)', Role.MEMBER, frontend.id);

  const mkTask = (data: {
    title: string;
    progress: Progress;
    ownerId: string;
    assigneeId: string;
    deadline?: Date | null;
    deletedAt?: Date;
  }) => prisma.task.create({ data });

  // Ma trận trạng thái — đủ để demo 2 trục + lát cắt OVERDUE của dashboard
  // 3 bucket tiến độ (leader giao member: owner≠assignee)
  const designSchema = await mkTask({
    title: 'Thiết kế schema',
    progress: Progress.DONE,
    ownerId: beLead.id,
    assigneeId: beA.id,
    deadline: daysFromNow(-2),
  }); // quá hạn NHƯNG DONE ⇒ KHÔNG overdue
  const writeAuth = await mkTask({
    title: 'Viết API auth',
    progress: Progress.IN_PROGRESS,
    ownerId: beLead.id,
    assigneeId: beA.id,
    deadline: daysFromNow(3),
  });
  const seedData = await mkTask({
    title: 'Seed dữ liệu',
    progress: Progress.TODO,
    ownerId: beLead.id,
    assigneeId: beB.id,
    deadline: daysFromNow(5),
  });
  // OVERDUE: deadline quá khứ + chưa DONE
  const migrationProd = await mkTask({
    title: 'Migration prod',
    progress: Progress.IN_PROGRESS,
    ownerId: beLead.id,
    assigneeId: beB.id,
    deadline: daysFromNow(-1),
  });
  const fixBug500 = await mkTask({
    title: 'Fix bug 500',
    progress: Progress.TODO,
    ownerId: beLead.id,
    assigneeId: beA.id,
    deadline: daysFromNow(-3),
  });
  // member tự tạo: owner = assignee; không deadline ⇒ không overdue
  const readPrismaDocs = await mkTask({
    title: 'Đọc docs Prisma',
    progress: Progress.TODO,
    ownerId: beA.id,
    assigneeId: beA.id,
    deadline: null,
  });
  // soft-deleted: phải BỊ LOẠI khỏi default scope
  const deletedTask = await mkTask({
    title: 'Task đã xoá',
    progress: Progress.TODO,
    ownerId: beLead.id,
    assigneeId: beB.id,
    deletedAt: new Date(),
  });
  // nhóm khác — chứng minh scope tách bạch (OVERDUE của FE)
  const feLayout = await mkTask({
    title: 'Dựng layout',
    progress: Progress.IN_PROGRESS,
    ownerId: feLead.id,
    assigneeId: feA.id,
    deadline: daysFromNow(-1),
  });

  return {
    password: SEED_PASSWORD,
    admin,
    teams: { backend, frontend },
    users: { beLead, beA, beB, feLead, feA },
    tasks: {
      designSchema,
      writeAuth,
      seedData,
      migrationProd,
      fixBug500,
      readPrismaDocs,
      deletedTask,
      feLayout,
    },
  };
}

/** CLI wrapper: `npm run seed` (tsx prisma/seed.ts). Hành vi giữ nguyên — hash thật + log tổng kết. */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedDatabase(prisma);
    console.log(
      'Seed xong: 1 admin · 2 nhóm · 6 user · 8 task (TODO/IN_PROGRESS/DONE + 3 overdue + 1 soft-deleted).',
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Chỉ chạy khi gọi trực tiếp (CLI), KHÔNG chạy khi bị e2e import.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
