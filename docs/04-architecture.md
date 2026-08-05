# Giai đoạn 4 — Thiết kế kiến trúc

> Hệ thống quản lý công việc nội bộ (Internal Task Management System)
> Tài liệu này chốt **kiến trúc tổng thể** và **lý do** đằng sau nó. Mọi quyết định về schema (Giai đoạn 5) và API (Giai đoạn 6) đều truy ngược về được tài liệu này và về Giai đoạn 1–2.
> Nguyên tắc xuyên suốt: **áp nguyên lý theo đòn bẩy, không theo giáo điều** — đi sâu ở chỗ có luật nghiệp vụ thật, giữ tối giản ở chỗ chỉ là CRUD. Đây cũng là câu trả lời cho rủi ro over-engineer của một dự án ~3 tuần.

---

## 0. Bối cảnh & ràng buộc đầu vào

Quyết định kiến trúc bị định hình bởi bốn nhóm ràng buộc đã chốt ở Giai đoạn 1–2:

- **Nghiệp vụ:** hai trục phân quyền (chức năng `admin` vs tổ chức `leader`/`member`); ownership ≠ assignment; hai trục trạng thái task (tiến độ vs tình trạng hạn suy ra); một leader/nhóm; mỗi leader-member thuộc đúng một nhóm; admin đứng ngoài cây tổ chức và **không tham gia luồng task** (chỉ break-glass có-log).
- **Phi chức năng:** bảo mật là ưu tiên cao nhất (record-level authz chống IDOR, JWT + refresh rotation, store dùng chung); module hoá + tách tầng; OpenAPI; Docker Compose + Postgres.
- **Mục tiêu cá nhân:** production-grade cho **portfolio backend**, không chỉ "đủ chạy". Kiến trúc phải *kể được chuyện* khi phỏng vấn.
- **Hoàn cảnh:** ~3 tuần, NestJS + React, thiên backend; quy mô tham chiếu ~50 user / ~10 nhóm / ~5.000 task.

Hai mục tiêu này (production-grade vs ~3 tuần) kéo ngược nhau. Toàn bộ Giai đoạn 4 là về **cân bằng** chúng một cách có chủ đích.

---

## 1. Các lựa chọn kiến trúc đã cân nhắc

### 1.0. Monolith vs microservices (cắt ở tầng cao nhất trước)
Trước khi bàn cách tổ chức *bên trong*, phải chốt *hình thái triển khai* — nếu không sẽ lặp đúng lỗi "giả định sẵn kiến trúc", chỉ ở tầng cao hơn.

| | Monolith (1 tiến trình, 1 CSDL) | Microservices (nhiều service, CSDL/triển khai riêng) |
|---|---|---|
| Giải vấn đề | Đơn giản build/deploy/transaction | Deploy độc lập, scale lệch từng phần, nhiều đội tách biệt |
| Tạo vấn đề | Có thể phình thành "big ball of mud" nếu không module hoá | Phức tạp mạng, giao dịch phân tán (saga), vận hành nhiều service, eventual consistency |

Ở quy mô dự án này — **~50 user, ~10 nhóm, một người làm, ~3 tuần** — microservices **giải các vấn đề không tồn tại** (không có nhu cầu deploy độc lập hay scale lệch giữa Tasks và Users) và **đẻ ra các vấn đề không cần** (giao dịch phân tán cho thao tác như vô-hiệu-hoá-leader-kèm-chỉ-định-thay; vận hành nhiều container; latency mạng cho những call vốn chỉ là gọi hàm). Đây là over-engineering kinh điển. → **Chốt monolith.**

Nhưng *monolith ≠ một khối bùn*: chọn **modular monolith** — ranh giới module rõ theo bounded context (§2). Đây là **đường cắt sẵn**: nếu sau này (bản portfolio, hoặc tải thật) một context cần tách thành service riêng, ranh giới module + port đã có sẵn để cắt theo, không phải mổ lại lõi.

> Lưu ý kể chuyện: một portfolio "microservices thật" là một *dự án khác* (cần nhu cầu thật để biện minh). Ở đây tín hiệu giá trị là **biết tiết chế và biết khi nào KHÔNG cần** — đồng thời chừa seam để tách nếu nhu cầu xuất hiện.

Trong phạm vi modular monolith (§1.0), việc tổ chức *bên trong* cũng **không phải nhị phân** "layered vs hexagonal" — nó là một *quang phổ*, và biến số thật sự là **"tầng domain đi sâu tới đâu, và ở module nào"**.

### 1.1. Option A — Layered + Modular (NestJS "đúng grain")
Mỗi bounded context là một NestJS module với ba tầng controller → service → repository; repository nói chuyện thẳng với ORM. Đây là đường vân của framework.

### 1.2. Option B — Hexagonal / Ports & Adapters cho *mọi* module
Mọi module đều có domain thuần (độc lập framework) + application (use case + ports) + infrastructure adapter. Mọi repo đứng sau interface; có mapper domain↔ORM ở khắp nơi.

### 1.3. Option C — Modular monolith, hexagonal *chọn lọc* (ĐÃ CHỐT)
Mặc định Option A khắp nơi. Riêng module có luật nghiệp vụ thật — **Tasks** — đẩy luật vào domain thuần + đặt repository/notifier sau port. Auth/Users/Stats giữ layered mỏng.

### 1.4. Bảng đánh đổi

| Trục đánh giá | A — Layered+Modular | B — Hexagonal toàn phần | **C — Hexagonal chọn lọc** |
|---|---|---|---|
| Phù hợp NestJS | Tuyệt đối (đúng grain) | Làm được nhưng ngược grain (tự wire token + mapper khắp nơi) | Đúng grain ở 3 module, chỉ "lội ngược" ở Tasks |
| Phức tạp vs ~3 tuần | Thấp nhất | Cao — rủi ro tiến độ thật (còn cả React) | Vừa — chỉ trả "thuế boilerplate" ở 1 module |
| Mở rộng portfolio | Ổn (ranh giới = module) | Xuất sắc | Rất tốt, đúng nơi nghiệp vụ sẽ lớn |
| Tín hiệu phỏng vấn | Chắc nhưng "an toàn" | Mạnh *nếu* không bị quy là cargo-cult | **Mạnh nhất cho mục tiêu này** |
| Rủi ro chính | Luật rò vào service biết-ORM; khó test luật biệt lập | Over-engineer cho app phần lớn là CRUD | Tính nhất quán: phải phát biểu rõ "quy tắc đi sâu" |

### 1.5. Lý do chốt C
C giải trực tiếp căng thẳng production-grade vs ~3 tuần: **SOLID/testability showcase đặt đúng chỗ đòn bẩy cao (Tasks), không trả thuế nghi thức trên CRUD tầm thường.** Câu chuyện phỏng vấn cũng mạnh nhất: *"tôi áp hexagonal chọn lọc vào bounded context có domain logic thật, giữ phần còn lại idiomatic — và đây là tiêu chí tôi dùng để vạch ranh giới"*. Rủi ro của C (tính nhất quán) được khử bằng §2.2 — phát biểu rõ quy tắc đi sâu.

### 1.6. Nền tảng dữ liệu: Postgres + ORM

**DBMS — chọn PostgreSQL (đề cho phép Postgres/MySQL).** Ở ~5.000 task, *MySQL chạy y hệt* — nên đây không phải lựa chọn ép bởi hiệu năng. Chọn Postgres vì vài thứ **miễn phí, không nhược điểm** ở dự án này, và phần lớn khớp đúng các quyết định đã ra:
- **`timestamptz` đúng nghĩa** (semantics timezone chuẩn) — khớp §8.4; `TIMESTAMP` của MySQL có quirk tz + dải hẹp.
- **Partial / expression index** (vd index riêng cho hàng `progress != DONE`) — hợp predicate OVERDUE + PERF-04.
- **Full-text + `pg_trgm` sẵn** cho đường nâng cấp tìm kiếm (FR-TASK-04); **`jsonb`** tốt cho audit-log/flexible field tương lai.
- Enum native, MVCC chắc, và là *default hiện đại* cho backend mới — tín hiệu portfolio sạch, image Docker sẵn.

**ORM — niềm tin "TypeORM hợp NestJS hơn" chỉ đúng một nửa; nói thẳng để bạn chọn đúng.**
- *Phần đúng:* có `@nestjs/typeorm` chính thức, style decorator đồng nhất với Nest, và **repository-pattern của TypeORM map gần như 1:1 lên port** (§3.2) — dễ kể chuyện hexagonal.
- *Phần ngược lại (mạnh):* **Prisma** type-safe + DX hơn hẳn, migration mượt hơn, và — điểm sắc cho *chính kiến trúc này* — nó **ép tách domain khỏi persistence**: model Prisma là type sinh ra, không thể vô tình dùng làm domain class như `@Entity` của TypeORM. Tức là cái khiến TypeORM "thân Nest" (entity decorator tái dùng được) lại chính là **cám dỗ vi phạm domain purity §2.3** mà bạn đang muốn khoe.
- *Điểm quyết định:* nhờ thiết kế **port + DIP** (§3.2, §4.1), ORM chỉ là **chi tiết trong adapter — swap được**, nên đây là quyết định *rủi ro thấp*: chọn cái năng suất nhất. Với hoàn cảnh này (đã thạo Prisma + ~3 tuần + type-safety là lợi thế cho portfolio + Prisma ép tách domain khỏi persistence) → **chốt Prisma**. Cái giá phải trả — mất vocabulary "repository 1:1" của TypeORM — là nhỏ, vì hexagonal vốn đã cần map domain↔persistence dù dùng ORM nào.
- *Prisma cắm vào port thế nào:* bọc `PrismaClient` trong một `PrismaService` (Nest provider); adapter `PrismaTaskRepository` *hiện thực* `TaskQueryPort`/`TaskWritePort`, gọi Prisma bên trong và **map model Prisma ↔ domain object** ngay tại biên adapter. Domain/use-case không hề biết Prisma (đúng §2.3).
- *Một micro-tradeoff đã giải:* §8.4 muốn một nguồn thời gian nhất quán — với Prisma dùng **app-now tính một lần mỗi request** (hoặc `$transaction`/`$queryRaw` nếu sau này muốn giờ DB tuyệt đối); minor ở quy mô này.

> Chốt: **Postgres + Prisma**. Các ví dụ dưới dùng tên adapter `PrismaTaskRepository`. Nếu cần đổi ORM về sau, chỉ động tới adapter — không tới domain/use-case (đó chính là lợi ích của port).

---

## 2. Kiến trúc tổng thể (Option C)

### 2.1. Bounded context → module
Bốn bounded context (khớp MAINT-01) thành bốn NestJS module + một `common`.

```
AuthModule        → layered mỏng   (đăng nhập, JWT, refresh rotation, logout)
UsersModule (Org) → layered mỏng   (CRUD + gán nhóm/role; invariant tổ chức là rule RỜI RẠC → kiểm ở service)
TasksModule       → đi sâu         (CỤM LUẬT ĐAN NHAU: ownership/assignment, hai trục trạng thái, authz record-level)
StatsModule       → đọc, phụ thuộc Tasks  (chỉ ĐỌC qua TaskQueryPort — không phải context bình đẳng, xem dưới)
common            → guards, exception filter, pagination, base DTO, decorators
```

> Ranh giới context cho chính xác: trong bốn cái trên, **Stats không phải bounded context độc lập bình đẳng** — nó là *context đọc phụ thuộc Tasks* (dùng `TaskQueryPort` nên biết cấu trúc dữ liệu Task). Đây là đánh đổi có chủ đích (tránh trùng logic query), có thể xem như một **read-model của Tasks**, không phải tách context thật. Nếu sau này cần, đó là chỗ dựng read-model/materialized view riêng.

### 2.2. Quy tắc "đi sâu domain" (khử rủi ro thiếu nhất quán của C)
> **Một module đi sâu hexagonal khi luật nghiệp vụ của nó *đan xen thành một mô hình* cần test biệt lập khỏi I/O — không phải chỉ vì "có hay không có invariant".**

Phải nói cho chính xác, vì Users *cũng* có invariant (một-leader/nhóm; chặn vô-hiệu-hoá-leader khi chưa có người thay). Tiêu chí thật không phải "có invariant hay không", mà là **mật độ và độ đan xen** của luật:
- **Tasks** có một *cụm luật đan nhau*: ownership≠assignment × hai trục trạng thái × OVERDUE suy ra × record-level authz × phạm vi nhóm. Chúng tương tác, nhiều nhánh, và đáng test độc lập khỏi DB/HTTP → tách domain thuần.
- **Users** có **vài rule rời rạc**: mỗi cái là một mệnh đề kiểm tra gọn, không đan vào nhau, kiểm ngay ở service-layer là đủ → dựng tầng domain riêng chỉ là nghi thức (SRP-thành-nghi-thức).

Đây mới là "quy tắc đi sâu" nhất quán — và là câu trả lời nếu giám khảo vặn *"Users cũng có invariant, sao lại layered?"*: không phải vì Users không có luật, mà vì luật của nó không tạo thành mô hình đáng cô lập.

### 2.3. Chiều phụ thuộc (dependency rule)
Trong module đi sâu, **mũi tên luôn trỏ vào trong**. Domain không import gì của Nest/Prisma.

```
        ┌──────────────────────────────────────────────┐
        │   interface   (controller, DTO, Swagger)     │  ← HTTP, framework
        ├──────────────────────────────────────────────┤
        │   application (use-cases, PORTS interface)   │  ← điều phối; phụ thuộc abstraction
        ├──────────────────────────────────────────────┤
        │   domain      (entity, due-rule, policy)     │  ← luật thuần, KHÔNG biết Nest/ORM
        └──────────────────────────────────────────────┘
              ▲                         ▲
              │ hiện thực port          │ hiện thực port
        ┌─────┴───────────┐     ┌───────┴──────────────┐
        │ PrismaTaskRepo  │     │ Notifier (Noop/SMTP) │  ← infrastructure ADAPTER
        └─────────────────┘     └──────────────────────┘
```

Infrastructure cũng trỏ *vào* domain (adapter hiện thực interface do tầng trong định nghĩa). Nhờ vậy luật task test được không cần DB.

---

## 3. Cấu trúc TasksModule (module đi sâu)

### 3.1. Bốn tầng
- **interface:** `TasksController` (HTTP, Swagger), DTO vào/ra, mapping HTTP ↔ use-case.
- **application:** các use-case (`CreateTask`, `AssignTask`, `UpdateProgress`, `EditDefinition`, `ListTasks`, `ReassignOrphaned`...). Phụ thuộc **port**, không phụ thuộc ORM.
- **domain:** entity `Task` (mang luật: ai đổi được gì), value/logic `DueStatus` (suy ra OVERDUE), `TaskPolicy` (quyết định authz record-level theo owner/assignee/nhóm).
- **infrastructure:** `PrismaTaskRepository` (hiện thực các port), `Notifier` adapter.

### 3.2. Các port (chốt sớm vì là điểm móc — xem §7)
- **`TaskWritePort`** — tạo/sửa/xoá/đổi tiến độ. Dùng bởi use-case ghi.
- **`TaskQueryPort`** — đọc/lọc/aggregate (tổ hợp được, biểu diễn ở DB). Dùng bởi `ListTasks` *và* StatsModule (ISP — Stats chỉ thấy port đọc).
- **`Notifier`** — phát thông báo. Bản v1: `NoopNotifier`. Mở rộng: `EmailNotifier`.

### 3.3. Luật domain đặt ở đâu
| Luật (Giai đoạn 1–2) | Đặt ở |
|---|---|
| ownership ≠ assignment (ai sửa định nghĩa, ai đổi tiến độ) | `Task` entity + `TaskPolicy` (domain) |
| OVERDUE = `deadline < now() AND progress != DONE` | `DueStatus` (domain) + **predicate SQL** trong `TaskQueryPort` |
| giao chỉ trong nhóm; phạm vi = nhóm assignee | `TaskPolicy` (domain) + check ở `AssignTask` use-case |
| record-level authz chống IDOR | `TaskPolicy` — *không* chỉ check role ở guard |

---

## 4. SOLID ánh xạ vào chính dự án (không phải định nghĩa chung)

> Cốt lõi: với mỗi chữ, nói rõ **nơi áp** (đòn bẩy cao) và **nơi là thừa** (nghi thức).

| Chữ | Áp vào dự án này | Nơi là thừa (đừng làm) |
|---|---|---|
| **S** — một lý do để đổi | Tách trong Tasks: HTTP / điều phối / luật / persistence là **bốn lý-do-đổi khác nhau** (authz đổi khác schema DB đổi). Để khi thêm email không phải sờ persistence. | Xẻ Auth/Users thành 4 tầng khi chúng chỉ có một lý-do-đổi. |
| **O** — mở rộng không sửa | **Cơ chế thông báo**: thêm kênh (email/in-app/Slack) qua `Notifier` + handler, không đụng code giao-việc. | Dựng strategy cho máy trạng thái TODO→IN_PROGRESS→DONE và rule OVERDUE đơn lẻ — premature. |
| **L** — thay thế được | Bài học *phủ định*: **đừng subclass role** (`Leader`/`Member`/`Admin`) vì `Admin` không có team → `getTeamTasks()` ở cha vỡ. Role là **dữ liệu** (`role` enum + `team_id` nullable), khớp đúng quyết định team_id nullable. Chỗ L *cần*: Prisma repo (adapter) và fake in-memory phải thay nhau được (cho test). | Bịa hệ phân cấp class chỉ để "dùng OOP". |
| **I** — interface theo nhu cầu client | Tách `TaskQueryPort` (Stats + List dùng) khỏi `TaskWritePort` (chỉ use-case ghi). Stats không phụ thuộc cả repo 20-method. | Xé thành interface một-method theo phản xạ. |
| **D** — phụ thuộc abstraction | Tasks use-case phụ thuộc token `TASK_REPOSITORY`, `NOTIFIER`; adapter hiện thực, wire qua custom provider. | Bọc token cho Auth/Users khi không có gì để swap. |

### 4.1. DI vs DIP — điểm nhấn (vì đây là câu hỏi gốc)
NestJS DI cho bạn **cơ chế** (IoC container); DIP là **nguyên lý** "trỏ mũi tên vào abstraction". Inject thẳng `PrismaTaskRepository` cụ thể = *dùng DI nhưng không phải DIP* (use-case vẫn biết về ORM). DIP chỉ xảy ra khi use-case phụ thuộc một *abstraction*:

```ts
// application/use-case: phụ thuộc ABSTRACTION (DIP)
constructor(
  @Inject(TASK_REPOSITORY) private readonly tasks: TaskWritePort,
  @Inject(NOTIFIER)        private readonly notifier: Notifier,
) {}

// tasks.module.ts: adapter HIỆN THỰC port (wiring)
{ provide: TASK_REPOSITORY, useClass: PrismaTaskRepository }
{ provide: NOTIFIER,        useClass: NoopNotifier }   // bản v1; đổi sang EmailNotifier sau
```

**Chiến lược (làm C mạch lạc):** DIP đầy đủ (token) **chỉ ở Tasks** — đổi lấy test biệt lập + seam email. Auth/Users **inject repo cụ thể** (DI mà chưa DIP) — vì không có gì swap, token chỉ là thuế. Chính ranh giới "DIP ở Tasks, DI thường ở CRUD" là câu trả lời cho "anh có over-engineer không": *áp theo đòn bẩy, không theo giáo điều.*

---

## 5. Phân quyền & break-glass (kiến trúc authz)

Hai lớp, ánh xạ đúng mô hình hai trục:

1. **Guard theo role (functional, coarse-grained):** `@Roles('leader')`... chặn sớm ở rìa HTTP. Trả lời "vai trò này được *gọi* endpoint không".
2. **Policy record-level (organizational/scope, fine-grained):** `TaskPolicy` trong domain trả lời "*chủ thể này* có quyền trên *bản ghi cụ thể này* không" — owner? assignee? cùng nhóm? Đây là lớp chống **IDOR** (SEC-04, FR-TASK-04): một leader role-hợp-lệ vẫn không đọc được task nhóm khác. **Không tin client; kiểm ở backend.**

**Break-glass admin:** không nhét "admin bypass mọi check" vào policy thường (sẽ biến admin thành super-manager ngầm, phá mô hình hai trục). Thay vào đó: một **nhánh tách bạch, có ghi log** cho thao tác cứu hộ (sửa dữ liệu hỏng, nhóm không có leader hoạt động, giải thể nhóm). Ca "member bị vô hiệu hoá còn task treo" **không** dùng break-glass — leader reassign trong nhóm (FR-USER-01, §5.4 Giai đoạn 1). Log của nhánh này là mầm cho audit-log đầy đủ ở portfolio.

---

## 6. Luồng Auth (JWT + refresh rotation)

```
LOGIN:    verify mật khẩu (bcrypt/argon2) ─► phát access (15') + refresh (7d, LƯU SERVER)
CALL API: gửi access ở Authorization header ─► guard verify ─► policy record-level
REFRESH:  gửi refresh ─► nếu hợp lệ & chưa thu hồi:
            ► phát access MỚI + refresh MỚI (rotation)
            ► VÔ HIỆU refresh vừa dùng
          nếu đã thu hồi/hết hạn ─► 401, buộc login lại
LOGOUT:   thu hồi refresh hiện tại (xoá khỏi store)
```

Quyết định kiến trúc kèm theo:
- **Refresh token store dùng chung** (DB ở bản v1; Redis là đường nâng cấp) — *không* in-memory per-instance, để claim "nhiều instance / stateless" không vỡ (SEC-02). "Stateless" ở đây = không session dính-instance, không phải không-có-state-server.
- **Rotation trong scope; reuse-detection ở Could-have — đây là *seam có chủ đích*, không phải đường nối lỏng.** Cần nói rõ vì hai cái gắn với nhau: rotation *một mình* chỉ rút ngắn vòng đời một token bị đánh cắp (lần refresh hợp lệ kế tiếp của nạn nhân sẽ fail → bị đá ra — một tín hiệu yếu, không có phản ứng tự động); **lợi ích bảo mật chính** — phát hiện trộm token và thu hồi cả "họ" token — chỉ có khi thêm **reuse-detection**. Vậy ở bản v1, rotation chủ yếu là **seam kiến trúc** (token đã lưu/xoay-vòng server-side, client đã quen lưu token mới), để reuse-detection sau này chỉ là *thêm logic*, không phải đập lại luồng.
- *Scope:* reuse-detection đã được đưa lên **Should-have** (MoSCoW GĐ1) — vì bảo mật là NFR ưu tiên cao nhất và nó chỉ tốn thêm ~0.5–1 ngày trên nền rotation (thêm cột "họ token"/lineage + một nhánh kiểm tra). Khi có nó, rotation mới phát huy lợi ích bảo mật đầy đủ.
- Sau mỗi lần rotation, phía client tiếp tục với refresh token mới ở lần refresh kế tiếp. Nơi lưu token phía client là chi tiết của hợp đồng API (Giai đoạn 6). Chi phí phối hợp nhỏ.

---

## 7. Điểm móc cho tính năng mở rộng (rìa vs lõi)

> Phân biệt **"gắn ở rìa"** (hoãn thoải mái, thêm sau không sửa lõi) với **"ăn vào lõi"** (phải thiết kế đúng từ đầu dù chưa làm hết). Không code sẵn các tính năng này; chỉ đảm bảo không quyết định nào cản đường.

| Tính năng mở rộng | Phân loại | Điểm móc đặt ở bước này | Điều DUY NHẤT phải đúng ngay |
|---|---|---|---|
| Email khi được giao việc | **RÌA** | Use-case `AssignTask` phát event `TaskAssigned` / gọi port `Notifier`; handler bản v1 = `NoopNotifier` | **Phải phát event/gọi port đúng điểm ngay bây giờ**, dù handler chưa làm gì. Không phát = sau này thêm email phải sửa lõi. |
| Biểu đồ thống kê (chart) | **RÌA** | Endpoint stats trả **counts có cấu trúc**: phân bố tiến độ (3 bucket) + lát cắt OVERDUE + theo người (đúng FR-DASH-01 đã sửa) | Số liệu có cấu trúc đó (đang làm sẵn) — chart chỉ là render frontend. Không cần gì thêm ở backend. |
| Lọc/tìm/phân trang nâng cao | **LÕI** | `TaskQueryPort` build WHERE (gồm **OVERDUE = predicate SQL**) + LIMIT/OFFSET, tổ hợp được; tìm `ILIKE` title+description | **Không** fetch hết rồi lọc/cắt trang trong JS. Read-path "criteria → SQL → page" từ ngày đầu, dù bản v1 chỉ phơi 2 filter. Làm sai = viết lại. |

Tóm: email và chart **gắn ở rìa** (port/event + dữ liệu có cấu trúc); **tầng truy vấn ăn vào lõi** và phải đúng ngay vì nó dính ràng buộc OVERDUE-predicate-SQL.

---

## 8. Mối quan tâm xuyên suốt (cross-cutting) & phạm vi có chủ đích

### 8.1. Xử lý lỗi & response lỗi nhất quán
Một **exception filter toàn cục** (ở `common`) biến mọi lỗi thành một *envelope JSON thống nhất*, để frontend xử lý đồng nhất và không bao giờ lộ stack trace (UX-01).
- **Cấu trúc lỗi thống nhất:** `{ statusCode, error, code, message, timestamp, path }`. `code` là mã máy-đọc ổn định (vd `TASK_NOT_IN_TEAM`, `LEADER_REPLACEMENT_REQUIRED`) để frontend rẽ nhánh không cần parse `message`.
- **Ba lớp lỗi map khác nhau:** (1) validation hình thức → 400 kèm chi tiết *từng field*; (2) luật nghiệp vụ (domain ném exception có nghĩa, vd vi phạm phạm vi nhóm) → 4xx tương ứng (403/409/400) kèm `code`; (3) lỗi ngoài dự kiến → 500 *chung*, log đầy đủ phía server, *không* lộ chi tiết ra client.
- Domain ném **exception nghiệp vụ thuần** (không phụ thuộc HTTP); một lớp map ở rìa dịch sang mã HTTP — giữ domain sạch (đúng dependency rule §2.3).

### 8.2. Validation đặt ở đâu (nguyên tắc phân tầng, không liệt kê rule)
- **Hình thức / cú pháp** (định dạng email, title không rỗng, kiểu dữ liệu) → **DTO + ValidationPipe ở rìa** (class-validator). Chặn input méo *trước khi* chạm nghiệp vụ (SEC-05).
- **Luật nghiệp vụ / ngữ nghĩa** (deadline quá khứ cần cờ, giao-trong-nhóm, ownership) → **domain/use-case**, không nhét vào DTO.

Ranh giới này thuộc kiến trúc; *rule field cụ thể* để Giai đoạn 6.

### 8.3. Transaction / nguyên tử (chỉ điểm danh ràng buộc)
Vài thao tác **đa-bước** phải nguyên tử, nếu không sẽ vỡ invariant:
- **Vô-hiệu-hoá-leader kèm chỉ-định-leader-thay** — nếu nửa chừng, nhóm có thể rơi vào trạng thái 0 hoặc 2 leader.
- **Reassign hàng loạt** task của member bị vô hiệu hoá.

Ý thức từ Giai đoạn 4: các use-case này chạy trong **một transaction** (unit-of-work). Cơ chế cụ thể — Prisma `$transaction` (interactive transaction) — để Giai đoạn 5/lúc code.

### 8.4. Thời gian & timezone (đính kèm cho OVERDUE)
OVERDUE suy ra bằng `deadline < now()`. Để tránh bug lệch giờ: dùng **một nguồn thời gian nhất quán** — `now()` của DB trong predicate (tự nhiên với query-builder), hoặc app-now tính *một lần* mỗi request (tự nhiên với Prisma typed-where) — *lợi ích phụ* của việc đã chọn suy-ra-bằng-SQL ở §7; lưu mọi mốc thời gian dạng **`timestamptz` (UTC)**, hiển thị theo TZ người dùng ở frontend.

### 8.5. Đã cân nhắc, KHÔNG đưa vào (chống over-engineer)
Nêu để cho thấy đã cân nhắc, không phải bỏ sót:
- **Caching (Redis):** ~5.000 task, query có index < 1s — chưa cần. (Redis nếu xuất hiện là cho refresh-token store đa-instance, không phải cache.)
- **Message queue:** email qua port/handler đồng bộ là đủ ở bản v1; queue là đường nâng cấp khi cần gửi bất đồng bộ/retry.
- **Rate limiting:** không cần toàn cục ở quy mô này — *nhưng* **endpoint auth (login/refresh) nên có throttle cơ bản** chống brute-force (bảo mật ưu tiên cao). Một dòng cấu hình, đáng làm.
- **Observability tập trung** (tracing/metrics/log aggregation): log ứng dụng + Docker logs là đủ; APM là chuyện hệ lớn.
- **Optimistic locking / API versioning / idempotency key:** quy mô một-đội-nhỏ, last-write-wins chấp nhận được; versioning có thể thêm `/v1` prefix rẻ về sau. Không đưa vào bản v1.

---

## 9. Phi chức năng → quyết định kiến trúc (map nhanh)

| NFR (Giai đoạn 2) | Quyết định kiến trúc tương ứng |
|---|---|
| SEC-03 (authz ở backend) | Guard + policy ở backend; frontend chỉ ẩn/hiện cho UX, không phải nguồn quyết định |
| SEC-04 (record-level, IDOR) | `TaskPolicy` fine-grained ở domain, không chỉ guard theo role |
| MAINT-01/02 (module hoá, tách tầng) | 4 module bounded-context + tách tầng; Tasks tách thêm domain |
| MAINT-03 (cấu hình qua env) | `ConfigModule`, secret/token-TTL/DB qua biến môi trường |
| Stateless / nhiều instance | App không giữ session RAM; refresh store dùng chung (DB/Redis) |
| PERF-02/03/04 (phân trang, index) | Phân trang + lọc ở `TaskQueryPort` (DB-level); index cột lọc (assignee, progress, deadline, team qua join) |
| DOC-01 (Swagger) | OpenAPI sinh từ decorator ở tầng interface |

---

## 10. Truy vết & bước tiếp theo

Tài liệu này truy ngược về:
- **Giai đoạn 1** §2 (hai trục phân quyền), §4 (hai trục trạng thái), §5 (ownership/assignment, scope, soft-delete §5.4), §6 (ma trận), §8 (NFR).
- **Giai đoạn 2** FR-AUTH (rotation), FR-TASK-04/05 (query-layer, OVERDUE-SQL), FR-DASH-01 (đã sửa), FR-USER-01 (soft-delete), NFR-SEC; Phần D (phạm vi task suy ra).

Và là nguồn tham chiếu cho:
- **Giai đoạn 5 — Data schema:** `schema.prisma` (model + enum) · User (team_id nullable) · Team (1 leader — *derive* từ User role+team_id, partial unique, **không** cột leader_id) · Task (owner ≠ assignee, *không* cột team_id riêng — scope suy ra) · RefreshToken (store dùng chung, có lineage cho reuse-detection) · `timestamptz` cho deadline · index theo PERF-04 · **chiến lược migration: `prisma migrate` (migration versioned), KHÔNG `db push` cho prod**.
- **Giai đoạn 6 — API contract:** endpoint Auth (login/refresh-rotate/logout) · Tasks CRUD + list (filter/search/paginate) · Stats · envelope lỗi (§8.1) + rule validation field-level · nơi áp guard + policy record-level.

> Ghi chú phương pháp: tài liệu cố tình ghi *lý do* và *đánh đổi* cho từng quyết định (chọn C thay vì B, áp DIP chọn lọc, vạch ranh giới đi-sâu-domain, phân loại rìa/lõi cho tính năng mở rộng). Đây là phần dùng để **kể chuyện khi phỏng vấn** — đặc biệt câu "anh áp SOLID thế nào mà không over-engineer".
