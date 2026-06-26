import { PrismaClient, Role, Progress } from '@prisma/client';
import * as argon2 from 'argon2'; // npm i argon2 (khớp hashing của auth service)

const prisma = new PrismaClient();
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main() {
  // Reset theo thứ tự an toàn FK: con trước (RefreshToken, Task) → cha (User, Team)
  await prisma.refreshToken.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  const pw = await argon2.hash('Password123!'); // CHỈ dev/demo — không phải secret thật, không commit secret prod

  // 1 admin — ngoài cây tổ chức (teamId null; CHECK: ADMIN ⟺ teamId NULL)
  await prisma.user.create({
    data: { email: 'admin@demo.local', name: 'Admin', role: Role.ADMIN, passwordHash: pw },
  });

  // 2 nhóm — để minh hoạ team-scoping (leader BE không thấy task FE)
  const backend = await prisma.team.create({ data: { name: 'Backend' } });
  const frontend = await prisma.team.create({ data: { name: 'Frontend' } });

  const mkUser = (email: string, name: string, role: Role, teamId: string) =>
    prisma.user.create({ data: { email, name, role, teamId, passwordHash: pw } });

  // Mỗi nhóm đúng 1 LEADER (partial unique) + member
  const beLead = await mkUser('be.lead@demo.local', 'Bích (BE lead)', Role.LEADER, backend.id);
  const beA    = await mkUser('be.a@demo.local',    'An (BE)',        Role.MEMBER, backend.id);
  const beB    = await mkUser('be.b@demo.local',    'Bảo (BE)',       Role.MEMBER, backend.id);
  const feLead = await mkUser('fe.lead@demo.local', 'Linh (FE lead)', Role.LEADER, frontend.id);
  const feA    = await mkUser('fe.a@demo.local',    'Hà (FE)',        Role.MEMBER, frontend.id);

  // Ma trận trạng thái — đủ để demo 2 trục + lát cắt OVERDUE của dashboard
  await prisma.task.createMany({
    data: [
      // 3 bucket tiến độ (leader giao member: owner≠assignee)
      { title: 'Thiết kế schema', progress: Progress.DONE,        ownerId: beLead.id, assigneeId: beA.id, deadline: daysFromNow(-2) }, // quá hạn NHƯNG DONE ⇒ KHÔNG overdue
      { title: 'Viết API auth',   progress: Progress.IN_PROGRESS, ownerId: beLead.id, assigneeId: beA.id, deadline: daysFromNow(3) },
      { title: 'Seed dữ liệu',    progress: Progress.TODO,        ownerId: beLead.id, assigneeId: beB.id, deadline: daysFromNow(5) },
      // OVERDUE: deadline quá khứ + chưa DONE (2 cái, để dashboard đếm > 1)
      { title: 'Migration prod',  progress: Progress.IN_PROGRESS, ownerId: beLead.id, assigneeId: beB.id, deadline: daysFromNow(-1) },
      { title: 'Fix bug 500',     progress: Progress.TODO,        ownerId: beLead.id, assigneeId: beA.id, deadline: daysFromNow(-3) },
      // member tự tạo: owner = assignee
      { title: 'Đọc docs Prisma', progress: Progress.TODO,        ownerId: beA.id,    assigneeId: beA.id, deadline: null },           // không deadline ⇒ không overdue
      // soft-deleted: phải BỊ LOẠI khỏi default scope
      { title: 'Task đã xoá',     progress: Progress.TODO,        ownerId: beLead.id, assigneeId: beB.id, deletedAt: new Date() },
      // nhóm khác — chứng minh scope tách bạch
      { title: 'Dựng layout',     progress: Progress.IN_PROGRESS, ownerId: feLead.id, assigneeId: feA.id, deadline: daysFromNow(-1) }, // OVERDUE (FE)
    ],
  });

  console.log('Seed xong: 1 admin · 2 nhóm · 6 user · 8 task (TODO/IN_PROGRESS/DONE + 3 overdue + 1 soft-deleted).');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
