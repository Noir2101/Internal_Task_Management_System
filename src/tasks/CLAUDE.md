# CLAUDE.md — TasksModule (module đi sâu)

> Root `CLAUDE.md` áp toàn repo. File này thêm luật hexagonal CHỈ cho `src/tasks/`.
> Đây là module DUY NHẤT đi sâu — "đi sâu" nghĩa là đẩy luật vào domain thuần và đặt I/O sau port,
> vì cụm luật của Tasks đan nhau và đáng test biệt lập khỏi DB/HTTP.

## Tầng & chiều phụ thuộc (mũi tên luôn trỏ vào trong)

```
interface/       TasksController, DTO vào/ra, projection → HTTP, Swagger
application/     use-cases + PORTS (interface)            → phụ thuộc abstraction
domain/          Task entity, DueStatus, TaskPolicy       → luật thuần, KHÔNG biết Nest/Prisma
infrastructure/  PrismaTaskRepository, Notifier adapter   → hiện thực port, map domain↔Prisma
```

## Luật cứng

- `domain/**` KHÔNG import `@prisma/client`, `@nestjs/*`, hay `infrastructure/**`. (ESLint chặn — lỗi build.)
- `application/**` phụ thuộc PORT qua token; không import `infrastructure/**`, không import Prisma.
- Map model Prisma ↔ domain CHỈ ở `infrastructure/PrismaTaskRepository`. Không rò type Prisma ra ngoài adapter.
- `TaskPolicy` ở `domain/` — quyết owner / assignee / cùng-nhóm. **scoped-load** (lọc theo nhóm) ở `PrismaTaskRepository`, KHÔNG ở controller.
- `DueStatus` ở `domain/` (suy OVERDUE) + **predicate SQL** trong `TaskQueryPort`. Cùng một `now` từ `Clock` — đừng rải `new Date()`.

## Ports (token)

- `TaskWritePort` — tạo / sửa / xoá / đổi tiến độ / reassign. Dùng bởi use-case ghi.
- `TaskQueryPort` — đọc / lọc / phân trang / aggregate. Dùng bởi `ListTasks` VÀ StatsModule (ISP — Stats chỉ thấy port đọc). Aggregate stats (`byProgress` + `byAssignee` outer-join) là **method của port này**, hiện thực trong adapter. Stats không tự viết query Prisma.
- `Notifier` — `NoopNotifier` bản v1; seam cho `EmailNotifier` (tốt nghiệp ở `docs/07.A-notifications.md`). **Bốn method.** Ba hook phát TỪ USE-CASE: `notifyAssigned` (CreateTask, CHỈ khi `assigneeId !== ownerId`), `notifyReassigned` (ReassignTask), `notifyTasksOrphaned` (Users.deactivate). Hook thứ tư `notifyOverdueDigest` phát từ LỊCH ĐỊNH KỲ ở infrastructure, không use-case nào gọi (GĐ11 slice 2, `docs/11 §6`); nó quét qua `TaskQueryPort.list({overdue:true})` — KHÔNG export `overduePredicate` của repository ra. Event MANG ID, không mang email — adapter tra email qua Prisma. **Phát event đúng điểm** dù handler no-op — không phát = sau này thêm email phải sửa lõi. Failure policy: adapter tự nuốt lỗi + log, `notify*` KHÔNG BAO GIỜ reject (email không được vỡ task-write) — TRỪ đường worker, chạy `rethrow: true` để BullMQ retry được; ở đó chỗ bảo vệ bất biến là `QueuedNotifier` phía ghi job.
- Wiring ở `tasks.module.ts`:
  `{ provide: TASK_REPOSITORY, useClass: PrismaTaskRepository }`,
  `{ provide: DIRECT_NOTIFIER, useFactory: … }` — chọn `EmailNotifier` (env `MAIL_ENABLED=true`) hay `NoopNotifier` (mặc-định-offline cho unit/CI/dev);
  `{ provide: NOTIFIER, … }` — có `REDIS_URL` thì là `QueuedNotifier` bọc quanh queue, không thì `useExisting: DIRECT_NOTIFIER`. Hai token tách nhau để worker gọi adapter thật; gọi lại `NOTIFIER` là job tự đẻ job.

## Use-cases

`CreateTask` · `EditDefinition` (owner) · `UpdateProgress` (assignee) · `ReassignTask` (leader) · `ListTasks` · `GetTask`.
Mỗi use-case mang đúng một luật authz, khớp one-law-per-endpoint của hợp đồng.

## Keystone realize ở đây

`GetTask`/`ListTasks` đi qua scoped-load:

```
scoped-load (repo lọc theo nhóm cho người không-admin)
   ├─ miss → 404 RESOURCE_NOT_FOUND
   └─ hit  → predicate hành động
               ├─ pass → thực thi
               └─ fail → 403 (code cụ thể)
```

Đây là choke-point chung cho cả IDOR lẫn lọc list. Làm `GET /tasks/:id` TRƯỚC, test 404/403 + projection, rồi nhân ra các endpoint còn lại.

## Test biệt lập (GĐ7, KHÔNG cần DB)

- `TaskPolicy` — mọi nhánh owner / assignee / cùng-nhóm.
- `DueStatus` — OVERDUE với clock cố định; gồm ca DONE-quá-hạn KHÔNG overdue và deadline NULL không overdue.
- ownership ≠ assignment.

Thay `PrismaTaskRepository` bằng fake in-memory. Nếu test domain đòi DB là đã sai tầng.
