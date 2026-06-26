# Giai đoạn 5 — Data schema

> Hệ thống quản lý công việc nội bộ (Internal Task Management System)
> Tài liệu này biến các quyết định nghiệp vụ/kiến trúc (Giai đoạn 1–4) thành **schema vật lý** (`schema.prisma`, constraint, index, migration, seed). Như các tài liệu trước, nó ghi lại **các lựa chọn đã cân nhắc, quyết định, và lý do** — để truy ngược và để kể chuyện khi phỏng vấn. Mọi quyết định ở đây truy về được Giai đoạn 1–2 (nghiệp vụ/yêu cầu) và Giai đoạn 4 (kiến trúc).
> Stack: **PostgreSQL + Prisma** (đã chốt §1.6 GĐ4). Quy mô tham chiếu: ~50 user / ~10 nhóm / ~5.000 task.

---

## 0. Triết lý ràng buộc: **(c) lai có nguyên tắc**

Không dồn hết vào DB (cứng nhắc, khó diễn đạt luật liên-bảng), cũng không dồn hết vào app (mất lưới an toàn ở biên). Chia theo bản chất từng invariant:

- **DB enforce** — ràng buộc *cấu trúc* + invariant *rẻ & phổ quát*, single-row: PK, FK, unique, not-null, enum domain, `CHECK` đơn giản, partial unique index.
- **Domain/app enforce** — invariant *liên-bảng / đặc thù ngữ cảnh / lifecycle* mà DB khó hoặc xấu khi diễn đạt: giao-trong-nhóm, ownership≠assignment, thay-leader, rotation/reuse-detection.

Tiêu chí phân loại không phải "quan trọng hay không" mà là **"DB có diễn đạt được rẻ và đúng ngữ nghĩa không"**. `CHECK` của Postgres chỉ thấy cột *cùng hàng* (không join) ⇒ mọi luật cross-table tự động rơi về domain.

---

## 1. Thực thể, thuộc tính & quyết định toàn cục

Bốn thực thể: **User, Team, Task, RefreshToken** (đúng Phần D GĐ2 — *không* bảng `audit_logs` ở bản nộp). Hai enum native PG: `Role {ADMIN, LEADER, MEMBER}`, `Progress {TODO, IN_PROGRESS, DONE}`.

Bốn quyết định cấp-schema áp cho mọi bảng, mỗi cái kèm lý do:

### 1.1. ID — `cuid(2)` (opaque), KHÔNG int auto-increment
- **Lựa chọn:** int tự tăng / uuid v4 / cuid2.
- **Chốt cuid2.** **Lý do:** hệ thống nặng chống IDOR (SEC-04, FR-TASK-04 "qua sửa URL/ID"); int tuần tự khiến đoán-ID-kế-tiếp tầm thường. Opaque ID nâng rào *và* hợp insert phân tán không cần điều phối.
- **Cảnh báo (ghi để không hiểu sai):** opaque ID là **defense-in-depth, KHÔNG phải ranh giới**. Ranh giới vẫn là record-level `TaskPolicy`. Coi "ID khó đoán" là lớp bảo vệ chính là đúng lỗi kinh điển.

### 1.2. Thời gian — `@db.Timestamptz(3)` trên MỌI cột DateTime
- **Lý do:** §8.4 GĐ4 chốt `timestamptz (UTC)`. Nhưng Prisma map `DateTime` → `timestamp(3)` *không* timezone theo mặc định trên Postgres ⇒ viết trơn `DateTime` là **âm thầm vi phạm** §8.4, gây bug lệch giờ đúng cái OVERDUE-predicate muốn tránh. Bắt buộc annotate từng cột.

### 1.3. Enum — native PG enum (qua Prisma), không lookup table
- **Lựa chọn:** native enum / bảng lookup.
- **Chốt native.** **Lý do:** `role`, `progress` là tập **đóng & ổn định**; lookup table chỉ đáng khi giá trị do người dùng thêm runtime hoặc cần metadata mỗi giá trị — không phải ở đây. Đánh đổi đã biết: đổi/xoá *giá trị* enum sau này tốn migration — chấp nhận được vì không định đổi.

### 1.4. `role` — MỘT enum `{ADMIN, LEADER, MEMBER}`, không tách hai cột
- **Lựa chọn:** một cột `role` / hai cột (functional `admin` vs organizational `leader/member`).
- **Chốt một enum.** **Lý do:** GĐ1 mô tả hai *trục* khái niệm, nhưng admin **loại trừ** leader/member và mỗi người ở **đúng một** vị trí ⇒ gộp một enum là biểu diễn trung thực và gọn. Khớp §4-L GĐ4 ("role là *dữ liệu*, đừng subclass — `Admin` không có team thì `getTeamTasks()` ở lớp cha vỡ"). Một enum cũng làm `CHECK team_id ⟺ role` viết gọn.

---

## 2. Quan hệ User ↔ Team — vòng tham chiếu (quyết định nền, định hình `schema.prisma`)

### 2.1. Vấn đề
Hai FK ngược chiều giữa cùng hai model (`User.team_id → Team`, `Team.leader_id → User`) đẻ ra: (1) **cycle** trong đồ thị FK; (2) Prisma **bắt đặt tên quan hệ** vì có *hai* quan hệ cùng cặp model; (3) **con-gà-quả-trứng** lúc insert. Điểm mấu chốt: độ đau của (3) do `leader_id` **NOT NULL** gây ra, *không* phải do cycle.

### 2.2. Các phương án

| | A — `leader_id` NOT NULL | B — `leader_id` nullable | **C — bỏ `leader_id`, derive (CHỐT)** |
|---|---|---|---|
| Bootstrap | Kẹt: cần deferred constraint + SQL thô; Prisma chọi | 3 bước trong `$transaction` (tạo team → leader → update) | Đơn giản nhất: team → leader → members, không update-back |
| Cycle | Có (cứng) | Có (mềm) | **Hết** (chỉ User→Team) |
| Named relation | Cần | Cần | **Không** (còn một quan hệ) |
| "1 leader/team" | structural | leader_id đơn trị | partial unique `WHERE role='LEADER'` |
| Redundancy `leader_id`↔`role` | Có (domain canh) | Có (domain canh) | **Không** (một nguồn sự thật) |
| `team.leader` | FK trực tiếp | FK trực tiếp | query `findFirst(teamId, role=LEADER)` |

### 2.3. Chốt **C** — leadership *derive* từ User
Leader của team T = User có `team_id=T ∧ role=LEADER`. **Không** cột `leader_id` trên Team.

**Lý do:** denormalize leader lên Team tạo **hai-nguồn-sự-thật** ("X là leader team T" mã hoá cả ở `Team.leader_id` lẫn ở `User.role+team_id` — drift được). C áp **cùng nguyên tắc một-nguồn-sự-thật** đã dùng cho Task-scope (không cột `team_id` trên Task, derive qua assignee): org-structure luôn derive từ User, nhất quán toàn schema. Đổi lại: hết cycle, hết named-relation ở cặp này, **xoá luôn** một bất biến domain ("leader phải có role=LEADER, team_id=T" — không còn cột thừa để lệch). Giá: `team.leader` thành một query (đường thưa — chỉ dùng khi báo leader N task treo, FR-USER-01).

**Phân tầng leadership (theo c):** ≤1 leader/team → **DB** (partial unique); ≥1 leader (trạng thái thường) → **domain** (thay-leader atomic); LEADER có team → phủ bởi `CHECK team_id ⟺ role` (DB).

---

## 3. Ownership ≠ Assignment (Task ↔ User)

`Task.owner_id` (người giao, sửa/xoá định nghĩa) và `Task.assignee_id` (người làm, đổi tiến độ) **cùng trỏ User**, cả hai **NOT NULL** (mỗi task đúng một owner + một assignee — §5.1/5.2 GĐ1). Member tự tạo ⇒ `owner_id = assignee_id`.

- **Named relation** (`TaskOwner`/`TaskAssignee`) như cặp ở #2, **nhưng KHÔNG cycle** — chỉ Task mang FK, `Task[]` bên User là back-relation ảo (không cột), nên không có bootstrap.
- **"Self-create ⇒ owner=assignee" KHÔNG ràng buộc ở DB:** luật *có điều kiện theo role của owner* (member ⇒ bằng; leader ⇒ khác), mà `role` ở bảng User ⇒ cross-table ⇒ `CHECK` không diễn đạt được ⇒ **domain** (`CreateTask` use-case).
- Mọi luật owner/assignee khác (giao-trong-nhóm; `owner.team = assignee.team`; assignee/owner ≠ ADMIN) đều cross-table ⇒ **domain**. ⇒ **Phần DB tối giản đúng (c): 2 cột NOT NULL + 2 FK.** Đây là split đúng, không phải lỗ hổng.
- *Nhất quán:* quyết định "scope = `assignee.team`" đứng vững **vì** invariant domain `owner.team = assignee.team` được giữ — không có chuyện owner lọt ngoài scope.

---

## 4. Bất biến — DB enforce cái nào (khoá triết lý c)

### 4.1. `CHECK` — chỉ HAI (đều raw SQL trong migration; Prisma không model CHECK trong DSL)

```sql
ALTER TABLE "User" ADD CONSTRAINT user_admin_no_team CHECK (
  (role = 'ADMIN'  AND "teamId" IS NULL) OR
  (role IN ('LEADER','MEMBER') AND "teamId" IS NOT NULL)
);
ALTER TABLE "Task" ADD CONSTRAINT task_title_not_blank CHECK (length(trim(title)) > 0);
```

`user_admin_no_team` phủ cả hai chiều (admin-không-team **và** leader/member-phải-có-team). `task_title_not_blank` là belt-and-suspenders cho rule "title không rỗng" vốn ở DTO (§8.2 GĐ4) — DTO phải cũng `trim + non-empty` để khớp (tránh ca DTO-pass-nhưng-DB-reject).

### 4.2. FK referential actions — khai *tường minh*, đừng nhận mặc định

| FK | onDelete | Lý do |
|---|---|---|
| `User.teamId → Team` | **Restrict** | Mặc định Prisma cho quan hệ optional là **SetNull** → set teamId=NULL cho leader/member ⇒ **vỡ CHECK**. Đúng cái bẫy "đừng nhận default". |
| `Task.ownerId → User` | **Restrict** | Giữ lịch sử (FR-USER-01: xoá cứng user còn task ⇒ phá toàn vẹn). |
| `Task.assigneeId → User` | **Restrict** | Như trên. |
| `RefreshToken.userId → User` | **Cascade** | Bất đối xứng có chủ đích: task là lịch-sử-cần-giữ (Restrict); refresh token là auth-state-vứt-được. |

### 4.3. Bảng tổng invariant → tầng

**DB enforce:**

| Invariant | Cơ chế |
|---|---|
| email · Team.name · tokenHash duy nhất | unique |
| ≤1 leader / team | partial unique `User(teamId) WHERE role='LEADER'` (raw SQL) |
| admin-no-team ⟺ leader/member-có-team | `CHECK` (raw SQL) |
| title không rỗng | `CHECK` (raw SQL) + DTO |
| tồn tại + cardinality owner/assignee/team/userId | FK + NOT NULL |
| progress hợp lệ; default TODO | enum type + default |

**Domain enforce (cross-table / lifecycle):**

| Invariant | Đặt ở |
|---|---|
| owner.team = assignee.team (giao-trong-nhóm) | `CreateTask`/`AssignTask` |
| member tự tạo ⇒ owner=assignee | `CreateTask` |
| assignee/owner ≠ ADMIN (luồng thường) | use-case |
| ≥1 leader/team + thay-leader atomic (demote cũ + promote mới) | use-case + `$transaction` (partial unique backstop) |
| chặn deactivate leader chưa có thay; deactivate member ⇒ báo leader | Users service + transaction |
| ownership≠assignment; record-level authz (IDOR) | `TaskPolicy` (domain) |
| allowPastDeadline; rotation/reuse-detection | use-case (Tasks/Auth) |

**Rìa (DTO/ValidationPipe):** email format, title-non-empty, kiểu/độ dài (§8.2, SEC-05).
**Không phải constraint:** OVERDUE = read suy ra (predicate SQL, không lưu); chuyển progress = *không* ràng buộc state-machine (chống over-engineer, §4-O).

### 4.4. Khớp nối quan trọng: partial-unique × thay-leader × soft-delete
Partial unique `WHERE role='LEADER'` đếm **mọi** hàng role=LEADER (kể cả inactive). ⇒ thay leader **không được** chỉ deactivate người cũ rồi promote người mới (sẽ thành 2 hàng LEADER ⇒ **DB từ chối**); use-case phải **demote `role→MEMBER`** đồng thời. Cấu trúc DB **backstop** đúng domain logic này. Vì leadership thuần theo `role` (không dính active), lựa chọn soft-delete ở #5 **không** động tới partial unique — decoupled.

---

## 5. Soft-delete

- **Lựa chọn:** (1) đồng nhất `deletedAt` mọi nơi; (2) tách — `isActive` cho User, `deletedAt` cho Task.
- **Chốt (2), `isActive Boolean @default(true)` cho User; `deletedAt` (timestamptz) cho Task.**
- **Lý do:** "vô hiệu hoá user" là *trạng thái vòng đời đảo-ngược-được* (login + bất biến leader/member truy vấn chủ động) ⇒ `isActive` đọc thật hơn; reactivate = `isActive=true` tự nhiên, không phải "un-delete". Task xoá là *tombstone* (giữ lịch sử, không undelete) ⇒ `deletedAt` đúng bài, lại ghi *khi nào*. Nhất quán với việc RefreshToken cũng có state-model riêng — không ép mọi thứ vào một khuôn.
- **Giá:** hai "live predicate" khác nhau (`isActive` vs `deletedAt IS NULL`) ⇒ scope làm **per-model**. Boolean không ghi *khi nào* disable — nhưng "khi nào" là audit, ngoài scope (MAINT-05). Nâng `status` enum nếu sau này có trạng thái thứ ba (SUSPENDED/LOCKED) — hiện 2 trạng thái nên boolean, tránh YAGNI.
- **Default scope** áp **tường minh ở repository/query-layer** (port đã là choke point) hơn global Prisma extension (extension rò ở raw/nested read). **email** giữ unique **toàn cục** (email = danh tính ổn định, không reuse sau deactivate).

---

## 6. OVERDUE — không có cột (tái khẳng định gọn)

OVERDUE = predicate `deadline < now() AND progress != 'DONE'`, **suy ra lúc đọc**, *không* lưu cột (đã chốt §4 GĐ1, FR-TASK-05). Dấu chân schema duy nhất là **partial index** đỡ predicate (xem #7). `deadline` nullable ⇒ task không deadline không bao giờ OVERDUE (predicate xử NULL gọn).

---

## 7. Chiến lược index (PERF-04, theo pattern truy vấn FR-TASK-04)

**Mệnh đề nền:** vì scope = `assignee.team_id` (derive, không cột `team_id` trên Task), "task nhóm tôi" là một **JOIN** (`Task JOIN User ON assigneeId WHERE User.teamId=X`), không phải `WHERE team_id=X`. ⇒ index phải đỡ **cái join**, không phải một `Task.team_id` không tồn tại.

**Bộ index (theo query thật):**

| Bảng | Index | Phục vụ |
|---|---|---|
| User | `@@index([teamId])` | vế lọc của join team-scope — *index khiến derive-scope khả thi* |
| Task | `@@index([assigneeId, progress])` | join-by-assignee (prefix trái) + lọc progress trong một index |
| Task | partial OVERDUE: `(deadline) WHERE progress<>'DONE' AND "deletedAt" IS NULL` (raw SQL) | lọc/sort OVERDUE ở DB trên index nhỏ |
| RefreshToken | `tokenHash` unique (sẵn) | query nóng nhất — tra mỗi lần refresh |
| RefreshToken | `@@index([familyId])`, `@@index([userId])` | reuse-detection thu hồi họ; revoke-all-sessions / cascade |

**KHÔNG index (cố ý):** `Task.ownerId` (không có query list-by-owner; owner chỉ dùng authz single-row) · search `title/description` (ILIKE `%q%` không dùng btree; 5000 dòng seq-scan <1s; GIN `pg_trgm` là đường nâng cấp đã chốt) · `deletedAt` đứng riêng (không selective; sống trong predicate partial index).

**Pagination:** offset + `ORDER BY "createdAt" DESC, id DESC` (id tiebreak → trang tất định). Keyset là nâng cấp khi deep-pagination thành vấn đề (không ở 5000 dòng). Ở PERF-01 bộ này thừa sức PERF-02 (<1s) — giá trị là *lý do chọn từng index*, không phải vắt perf.

---

## 8. RefreshToken — schema bảo mật (rotation + reuse-detection)

Cột: `tokenHash` (unique), `userId` (FK Cascade), `familyId`, `usedAt?`, `revokedAt?`, `expiresAt`, `createdAt` — tất cả timestamp `@db.Timestamptz`.

### 8.1. Hash bằng **SHA-256**, KHÔNG bcrypt/argon2
- **Lý do kép:** (1) refresh token là **random high-entropy** (≥256 bit) — brute-force bất khả thi bất kể tốc độ hash, nên cái chậm của bcrypt chỉ phạt latency mỗi lần refresh; (2) **quan trọng hơn**: bcrypt/argon2 salt ngẫu nhiên ⇒ output khác mỗi lần ⇒ **không thể** `WHERE tokenHash = bcrypt(presented)` — mất luôn khả năng tra trực tiếp. SHA-256 **tất định** ⇒ lookup unique một phát.
- **Phân biệt:** password → argon2/bcrypt (SEC-01, low-entropy, cần chậm); refresh token → SHA-256 (high-entropy, cần tra nhanh). *Hardening tuỳ chọn:* HMAC-SHA256 với pepper server-side.
- Refresh là **chuỗi opaque random**, không phải JWT (đã lưu+tra server-side, store là nguồn quyền-lực revoke). Access mới là JWT ngắn stateless.

### 8.2. Ba trạng thái bằng HAI timestamp trực giao (không enum)
- **Lựa chọn:** `usedAt`+`revokedAt` (timestamps) / `status` enum / hai boolean.
- **Chốt hai timestamp.** **Lý do:** *used* (đã rotate) và *revoked* (logout/family-revoke) là **hai sự kiện trực giao** — một token đã-rotate vẫn có thể bị family-revoke sau ⇒ tồn tại tổ hợp "used AND revoked" mà enum 3-trị **không** biểu diễn được. Hai cột nullable model đúng cả 4 tổ hợp, lại ghi *khi nào* (forensics).
- Token usable ⟺ `usedAt IS NULL AND revokedAt IS NULL AND expiresAt > now()`.

### 8.3. Lineage: **flat `familyId`**, không `replacedById`
Reuse-detection chỉ cần "token này đã used chưa?" (`usedAt`) và "revoke cả họ" (`UPDATE ... WHERE familyId=F AND revokedAt IS NULL` — đỡ bởi `@@index([familyId])`). Linked-list `replacedById` chỉ cần nếu muốn dựng lại *thứ tự chuỗi* — bỏ, để dành portfolio.

### 8.4. Thuật toán reuse-detection (schema đỡ; logic ở Auth use-case)
`/refresh(token)` → `h=sha256(token)` → tìm `tokenHash=h`:
- không có / `revokedAt` set / hết hạn → **401**.
- **`usedAt` set** (đã rotate mà trình lại) → **REUSE** → revoke cả family → 401, buộc login lại. *Nạn nhân cũng bị đá ra, nhưng kẻ trộm bị khoá* — lợi ích bảo mật chính của rotation (§6 GĐ4).
- active → rotate: set `usedAt=now`, tạo con (cùng `familyId`, hash mới), trả access+refresh mới.

**Bắt buộc atomic:** cụm tìm–kiểm–`usedAt`–đẻ-con trong **một transaction** (+ khoá hàng / dựa `@unique`) để hai refresh đua nhau không cùng rotate. (domain — §8.3 GĐ4.)

### 8.5. Vận hành
Mỗi login = một `familyId` mới ⇒ user có N family (đa thiết bị); logout = revoke token *active* hiện tại. Cleanup `DELETE WHERE expiresAt < now()` là housekeeping **tuỳ chọn**, không Must.

---

## 9. `schema.prisma` (nguồn sự thật)

> Các ràng buộc Prisma không model (2 CHECK + 2 partial index) nằm trong migration thủ công — xem §10. Comment `[RAW SQL]` trong file đánh dấu chỗ.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
generator client {
  provider = "prisma-client-js"
}

enum Role     { ADMIN  LEADER  MEMBER }
enum Progress { TODO  IN_PROGRESS  DONE }

model User {
  id           String   @id @default(cuid(2))
  email        String   @unique
  passwordHash String                                    // argon2/bcrypt (SEC-01)
  name         String
  role         Role
  teamId       String?                                   // admin NULL; leader/member NOT NULL (CHECK [RAW SQL])
  isActive     Boolean  @default(true)                   // soft-deactivate (đảo ngược được)
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt      @db.Timestamptz(3)

  team          Team?          @relation(fields: [teamId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  ownedTasks    Task[]         @relation("TaskOwner")
  assignedTasks Task[]         @relation("TaskAssignee")
  refreshTokens RefreshToken[]

  @@index([teamId])
  // [RAW SQL] CREATE UNIQUE INDEX user_one_leader_per_team ON "User"("teamId") WHERE role = 'LEADER';
}

model Team {
  id        String   @id @default(cuid(2))
  name      String   @unique
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt      @db.Timestamptz(3)
  members   User[]                                        // quan hệ duy nhất → không cần đặt tên; KHÔNG leader_id
}

model Task {
  id          String    @id @default(cuid(2))
  title       String                                      // NOT NULL + CHECK length(trim)>0 [RAW SQL]
  description String?
  progress    Progress  @default(TODO)
  deadline    DateTime? @db.Timestamptz(3)                // NULL ⇒ không bao giờ OVERDUE
  ownerId     String
  assigneeId  String
  deletedAt   DateTime? @db.Timestamptz(3)                // soft-delete tombstone
  createdAt   DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime  @updatedAt      @db.Timestamptz(3)

  owner    User @relation("TaskOwner",    fields: [ownerId],    references: [id], onDelete: Restrict)
  assignee User @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: Restrict)
  // KHÔNG có teamId — scope suy ra qua assignee.teamId

  @@index([assigneeId, progress])
  // [RAW SQL] CREATE INDEX task_overdue ON "Task"(deadline) WHERE progress <> 'DONE' AND "deletedAt" IS NULL;
}

model RefreshToken {
  id        String    @id @default(cuid(2))
  tokenHash String    @unique                             // SHA-256 (tất định) — KHÔNG bcrypt
  userId    String
  familyId  String                                        // lineage cho reuse-detection
  usedAt    DateTime? @db.Timestamptz(3)                  // set khi rotate
  revokedAt DateTime? @db.Timestamptz(3)                  // set khi logout / family-revoke (trực giao usedAt)
  expiresAt DateTime  @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([familyId])
  @@index([userId])
}
```

---

## 10. Migration — cụ thể hoá (đầu vào cho Giai đoạn 7)

Chiến lược: **`prisma migrate` (versioned), KHÔNG `db push` cho prod** (§10 GĐ4). Vì có 4 ràng buộc Prisma không model, dùng luồng `--create-only`:

1. `npx prisma migrate dev --name init --create-only` — sinh SQL từ schema (bảng, enum, FK, `@@index`), **chưa chạy**.
2. Mở `prisma/migrations/<ts>_init/migration.sql`, **append ở cuối** (sau khi bảng/cột đã tạo):

```sql
-- admin-no-team ⟺ leader/member-có-team
ALTER TABLE "User" ADD CONSTRAINT user_admin_no_team CHECK (
  (role = 'ADMIN' AND "teamId" IS NULL) OR
  (role IN ('LEADER','MEMBER') AND "teamId" IS NOT NULL)
);
-- title không rỗng / chỉ khoảng trắng
ALTER TABLE "Task" ADD CONSTRAINT task_title_not_blank CHECK (length(trim(title)) > 0);
-- ≤1 LEADER / nhóm
CREATE UNIQUE INDEX user_one_leader_per_team ON "User"("teamId") WHERE role = 'LEADER';
-- OVERDUE: predicate ở DB, index nhỏ (loại DONE + deleted)
CREATE INDEX task_overdue ON "Task"(deadline) WHERE progress <> 'DONE' AND "deletedAt" IS NULL;
```

3. `npx prisma migrate dev` — áp full (gồm SQL tay). Prod: `npx prisma migrate deploy`.
4. **Seed TÁCH khỏi migrate** (seed ≠ migration): `package.json` → `"prisma": { "seed": "ts-node prisma/seed.ts" }`, chạy `npx prisma db seed` *sau* migrate. Seed là reset-được/không-versioned.

> Tất cả SQL-thô ở một chỗ (một migration `init`). schema.prisma không 100% là full-truth (CHECK/partial index vô hình ở DSL) — bù bằng comment `[RAW SQL]` trỏ tới migration.

---

## 11. Seed (NFR-DEPLOY-03) — thiết kế theo *ma trận trạng thái*

Không phải "vài dòng cho có" — mỗi task minh hoạ một nhánh dashboard/filter cần kiểm:

| Mục | Có gì | Chứng minh |
|---|---|---|
| 1 admin | teamId NULL | admin ngoài cây (CHECK) |
| 2 nhóm (BE/FE) | mỗi nhóm 1 leader + 2 member | team-scoping; đúng 1 LEADER/nhóm (partial unique) |
| Task 3 bucket | TODO / IN_PROGRESS / DONE | phân bố trục tiến độ |
| DONE quá hạn | deadline quá khứ + DONE | predicate **loại** khỏi OVERDUE |
| 3 OVERDUE (gồm 1 ở FE) | deadline quá khứ + chưa DONE | lát-cắt OVERDUE đếm >1; scope tách bạch |
| no-deadline | deadline NULL | không bao giờ OVERDUE |
| member tự tạo | owner = assignee | tự-giao |
| soft-deleted | deletedAt set | bị loại khỏi default scope |

Thứ tự tạo (C đơn giản hoá): team → leader (teamId, role=LEADER) → members → tasks. Không update-back. Chi tiết: `seed.ts`.

---

## 12. ERD — generate từ schema (không vẽ tay Chen)

```prisma
generator erd {
  provider = "prisma-erd-generator"   // npm i -D prisma-erd-generator @mermaid-js/mermaid-cli
}
```
`npx prisma generate` xuất ERD (Mermaid/SVG) *từ* `schema.prisma` — đổi schema thì ERD tự đồng bộ, không lệch.

---

## 13. Changelog — sửa 01/02/04 trong GĐ5 (đã áp dụng)

> Các bản 01/02/04 hiện hành **đã phản ánh** những thay đổi dưới đây. Đây là *bản ghi lịch sử* để truy vết, **không phải việc cần làm** — session sau không cần sync lại.

Quyết định C ở §2 làm lệch vài chỗ trong tài liệu cũ, đã sửa:
- **02 Phần D:** "leader_id trên Team" → derive + partial unique.
- **02 FR-USER-01** & **01 §5.4:** wording "team_id được giữ" → làm rõ Task *không* có cột `team_id`; scope qua `assignee.team_id` bảo toàn vì user chỉ soft-delete.
- **04 §10:** "Team (1 leader)" → "derive, partial unique, không leader_id".

Phần còn lại của GĐ1–4 nhất quán với schema này.

---

## 14. Truy vết & bước tiếp theo

Tài liệu này truy ngược về: GĐ1 §2/§4/§5 (hai trục phân quyền, hai trục trạng thái, ownership/scope/soft-delete), §8 (NFR); GĐ2 Phần D (hệ quả schema), FR-AUTH/TASK/USER, NFR-SEC/PERF; GĐ4 §1.6 (Postgres+Prisma), §2–§4 (port/DIP), §7 (rìa/lõi), §8 (cross-cutting), §10.

Là nguồn tham chiếu cho:
- **Giai đoạn 6 — API contract:** endpoint/DTO; nơi áp guard + `TaskPolicy` record-level; envelope lỗi field-level.
- **Giai đoạn 7 — Code:** `schema.prisma` + migration (§9–§10) đã sẵn; *hiện thực* các invariant đã-chỉ-định-domain ở #3/#4/#7 (giao-trong-nhóm, ownership, thay-leader atomic, thuật toán rotation/reuse-detection). Schema đã đỡ đủ — không quyết định nào ở GĐ5 cản đường.

> **Ghi chú phương pháp:** tài liệu cố tình ghi *lựa chọn + đánh đổi + lý do* cho từng quyết định lớn (derive-leader thay vì leader_id, split soft-delete, SHA-256 thay vì bcrypt cho token, index theo join vì derive-scope, raw-SQL cho CHECK/partial-index). Đây là phần **bảo vệ trước giảng viên** và **kể chuyện phỏng vấn** — đặc biệt câu "anh thiết kế schema thế nào để vừa production-grade vừa không over-engineer ở đồ án 23 ngày".
