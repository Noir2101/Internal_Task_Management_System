# Giai đoạn 8 — Kế hoạch test (test hardening)

> Hệ thống quản lý công việc nội bộ (Internal Task Management System)
> Tài liệu này ghi chiến lược test tự động của backend và ma trận ca test. Giai đoạn 7 cố tình hoãn
> phần này (`docs/07-build-plan.md §4`): GĐ7 chỉ test keystone domain, coverage rộng để dành GĐ8.
> Mục tiêu GĐ8: biến các đợt verify tay rải rác thành một lưới tự động bền, nằm lại trong repo.
> Như các tài liệu trước, nó ghi lý do và đánh đổi cho từng quyết định lớn. KHÔNG sửa hợp đồng
> đông cứng `docs/00–06`.

---

## Bảng thuật ngữ

| Thuật ngữ | Nghĩa ngắn |
|---|---|
| e2e (end-to-end) | Test gọi HTTP thật qua nguyên stack Nest (guard, pipe, filter, DB), không mock tầng trong. |
| unit | Test một đơn vị biệt lập, thay phụ thuộc bằng fake/mock; không DB, không mạng. |
| fixture | Bộ dữ liệu mẫu tất định nạp trước mỗi test (chính là `prisma/seed.ts`). |
| cô lập (isolation) | Bảo đảm test này không thấy dữ liệu test kia. Ở đây làm bằng truncate cộng reseed. |
| handle | Con trỏ tới entity đã seed (kèm ID) để test assert. |
| envelope | Khung JSON thống nhất bọc mọi lỗi (`{statusCode, error, code, message, timestamp, path, requestId}`). |
| code | Machine key trong envelope. Là phần hợp đồng frontend rẽ nhánh. Test assert trên nó. |
| cổng cơ học (executable gate) | Kiểm tra tự fail khi bất biến bị vi phạm (lint rule, projection test, Clock provider). |
| keystone | Trục "thấy được so với được phép": scoped-load đẻ ra ranh giới 404 và 403. |
| smoke tay | Kiểm chứng thủ công một lần bằng curl, không nằm trong lưới tự động. |

---

## 1. Ranh giới Giai đoạn 7 so với Giai đoạn 8

`docs/07-build-plan.md §4` chốt: GĐ7 test-as-you-go khoanh hẹp đúng keystone domain, coverage rộng để
dành GĐ8. Bảng dưới phân đôi cho rõ ai lo phần nào.

| Nằm ở GĐ7 (giữ nguyên, không phá) | Thêm ở GĐ8 |
|---|---|
| `TaskPolicy` mọi nhánh (owner/assignee/cùng-nhóm) | e2e Auth: login password-first, rotation, reuse-detection, logout |
| `DueStatus` OVERDUE với clock cố định | e2e Users: deactivate/reactivate, các code 409, mass-assignment, hide→404 |
| keystone `GetTask` 404/403 + projection | e2e Teams: leader-swap atomic, break-glass, roster |
| projection default-deny (field cấm) | e2e Tasks: pagination, sort, overdue×progress, search, IDOR, one-law |
| create-task self-assign gate, prisma-map, stats shape | e2e Prisma-error thật (P2002), unit EmailNotifier |

Số test sau GĐ8: **unit 45** (39 cũ cộng 6 EmailNotifier) và **e2e 42** (4 spec).

---

## 2. Chiến lược test-DB

Build-plan im lặng về hạ tầng test. Các quyết định dưới đây chốt theo Luật số 0 (docs im lặng thì hỏi
người), đã được xác nhận.

| Chủ đề | Quyết định | Lý do |
|---|---|---|
| Database | `itms_test` riêng trên Postgres 18 của `docker-compose` sẵn có | Tái dùng hạ tầng, không thêm dependency (nhất quán build-plan §6 chống over-engineer). |
| Tạo DB | `globalSetup` tạo `itms_test` nếu chưa có, rồi `prisma migrate deploy` | Áp đủ migration gồm 4 raw-SQL constraint. KHÔNG `db push`, KHÔNG `migrate reset` (kỷ luật `/migrate`). |
| Cô lập | Truncate hết bảng cộng reseed fixture TRƯỚC mỗi test (`beforeEach`) | Mỗi test độc lập hoàn toàn. `seedDatabase` tự reset rồi tạo, một lệnh lo cả hai. |
| Tốc độ | Hash argon2 của seed tính MỘT lần cho cả run (cache) | argon2 chậm khoảng 100ms mỗi hash; cache cho reseed per-test không cộng dồn. |
| Song song | `maxWorkers: 1` | Một DB test dùng chung cộng truncate-per-test; chạy song song sẽ giẫm nhau. |
| Notifier | `NoopNotifier` (`test/setup/env.ts` **gán** `MAIL_ENABLED='false'`) | e2e KHÔNG gửi email, không chạm mạng. Phải GÁN chứ không `delete`: dotenv chỉ chừa key đã tồn tại, nên xoá key là mời `.env` của máy dev điền vào (`docs/11` mục 7.4). |
| Redis | `test/setup/env.ts` gán `REDIS_URL=''` | Khoá cả throttle store (GĐ11 slice 1) lẫn queue thông báo (slice 2). Lưới e2e chạy một tiến trình, KHÔNG cần Redis. |
| Throttle | `ThrottlerGuard` override thành pass-through trong app e2e | Suite login-nhiều không dính 429 giả; 429 verify bằng smoke tay (mục 6). |

Biến `DATABASE_URL` trỏ `itms_test` được set ở `test/setup/env.ts` (chạy trước khi test import
AppModule). dotenv của `@nestjs/config` KHÔNG override biến process.env đã set, nên giá trị test thắng
`.env`. Có thể trỏ DB test sang server khác qua biến `TEST_DATABASE_URL`.

---

## 3. Nguyên tắc assert

- **Assert trên `code` cộng status, KHÔNG assert `message`.** `docs/06 §7.1` chốt `message` đổi và dịch
  tự do; chỉ `code` là hợp đồng. Test bám `message` sẽ giòn một cách sai.
- **Test hành vi quan sát được.** Kiểm HTTP status, `code`, và hình dạng response. Không nhắc lại chi
  tiết hiện thực bên trong.
- **Phủ bất biến spine, không chạy theo phần trăm dòng.** Ma trận mục 5 map mỗi ca về một FR hoặc một
  bất biến, không nhắm một con số coverage.
- **Ba cổng cơ học giữ xanh, không nới lỏng.** Test mới không đụng vào ba override lint domain-purity,
  không đụng projection default-deny, không đụng Clock provider.
- **Không đổi production logic.** GĐ8 chỉ đổi code production khi một test bắt bug thật; lúc đó dừng, báo
  người, ghi `implementation-log`. Phiên GĐ8 đầu không bắt bug logic nào.

---

## 4. Kiến trúc harness

```
test/
  jest-e2e.json          globalSetup + setupFiles env + maxWorkers 1 + testTimeout 30s
  setup/
    env.ts               set DATABASE_URL → itms_test, NODE_ENV=test, xoá MAIL_ENABLED, JWT secret hermetic
    global-setup.ts      CREATE DATABASE itms_test (nếu chưa có) → prisma migrate deploy
    test-app.ts          buildTestApp(): AppModule + override ThrottlerGuard + configureApp() → { app, prisma }
    fixture.ts           resetAndSeed(prisma): truncate + reseed (hash cache) → SeedHandles
    auth.ts              loginAs(app,email) → { accessToken, cookie }; authHeader()
  auth.e2e-spec.ts  ·  users.e2e-spec.ts  ·  teams.e2e-spec.ts  ·  tasks.e2e-spec.ts
```

Hai điểm nối với production, đều là refactor bảo-toàn-hành-vi để bật test, KHÔNG đổi logic:

- **`src/app-config.ts`** — trích `configureApp(app)` khỏi `main.ts` (requestId, cookieParser, prefix,
  ValidationPipe, filter). `main.ts` và e2e cùng gọi nó, nên e2e chạy đúng pipeline prod, không drift.
- **`prisma/seed.ts`** — trích `seedDatabase(prisma, opts?)` trả về handle. Wrapper CLI (`prisma db
  seed`) vẫn gọi nó, hành vi seed giữ nguyên. `opts.passwordHash` cho e2e truyền hash đã cache.

e2e xác thực bằng **login thật** (`POST /auth/login`, mật khẩu seed `Password123!`), lấy access token
rồi đi qua nguyên `JwtAuthGuard` global và record-level authz. Refresh và logout bắt `Set-Cookie` rồi
replay. Không giả token, không bỏ guard (trừ ThrottlerGuard).

---

## 5. Ma trận ca test

Nguồn ca test: `docs/02-requirements.md` (BDD Given/When/Then). Mỗi hàng map về một FR hoặc bất biến.

### 5.1. `auth.e2e-spec.ts` — FR-AUTH-02..04 (docs/06 §6)

| Ca | Status cộng code |
|---|---|
| login đúng, user active | 200, có `accessToken` cộng user projection cộng cookie HttpOnly |
| login sai mật khẩu | 401 `INVALID_CREDENTIALS` |
| login email lạ | 401 `INVALID_CREDENTIALS` (không lộ email tồn tại) |
| login tài khoản bị vô hiệu hoá | 403 `ACCOUNT_DISABLED` |
| refresh rotation | 200, cookie mới khác cookie cũ |
| refresh thiếu cookie | 401 `SESSION_EXPIRED` |
| reuse-detection: trình lại cookie đã rotate | 401 `SESSION_EXPIRED`; token con cũng 401 (family revoke) |
| logout rồi refresh lại | logout 204; refresh sau đó 401 `SESSION_EXPIRED` |
| me Bearer hợp lệ / thiếu token | 200 user projection / 401 `TOKEN_INVALID` |

### 5.2. `users.e2e-spec.ts` — FR-USER-01/02 (docs/06 §9)

| Ca | Status cộng code |
|---|---|
| deactivate member | 200, `isActive=false`, `orphanedTaskCount=2` (loại DONE cộng soft-deleted) |
| reactivate | 200, `isActive=true` |
| deactivate leader chưa có người thay | 409 `LEADER_REPLACEMENT_REQUIRED` |
| admin deactivate chính mình | 409 `CANNOT_DISABLE_SELF` |
| create ADMIN kèm teamId; create MEMBER thiếu teamId | 400 `VALIDATION_FAILED` |
| create email trùng | 409 `EMAIL_TAKEN` (P2002 chạy thật qua DB) |
| create LEADER cho nhóm đã có leader | 409 `LEADER_ALREADY_EXISTS` |
| PATCH có `role`/`teamId` trong body | 400 `VALIDATION_FAILED` (mass-assignment chặn) |
| non-admin gọi `/users` | 404 `RESOURCE_NOT_FOUND` (hide) |
| GET `/users` | meta `{page,limit,total,totalPages}`; mặc định loại inactive |

### 5.3. `teams.e2e-spec.ts` — FR-USER-02 (docs/06 §9.3/§9.4)

| Ca | Status cộng code |
|---|---|
| leader-swap promote member | 200; leader cũ về MEMBER; đúng một leader mỗi nhóm |
| leader-swap sang người ngoài nhóm | 400 `LEADER_NOT_TEAM_MEMBER` |
| create team trùng tên | 409 `TEAM_NAME_TAKEN` (P2002 chạy thật) |
| break-glass DELETE nhóm rỗng | 204 |
| break-glass DELETE nhóm còn member | 409 `TEAM_NOT_EMPTY` cộng một dòng log BreakGlass |
| roster nhóm mình (member) | 200, brief `[{id,name}]`, không lộ email/role/isActive |
| roster nhóm khác | 404 `RESOURCE_NOT_FOUND` |

### 5.4. `tasks.e2e-spec.ts` — FR-TASK-01..05 (docs/06 §3/§4)

| Ca | Status cộng code |
|---|---|
| pagination | meta đúng; `limit=200` vượt trần 100 nên 400 `VALIDATION_FAILED`; default limit 20 |
| sort tất định | thứ tự `createdAt DESC, id DESC` |
| overdue×progress cùng một `now` | `?overdue=true` ra đúng 2 task, cờ `overdue:true`; DONE-quá-hạn bị loại |
| `?overdue=false` | loại 2 task quá hạn nhưng giữ DONE-quá-hạn (không overdue) |
| search ILIKE | `?q` khớp title (không phân biệt hoa thường) và khớp description |
| IDOR | leader BE xem task FE nên 404 `RESOURCE_NOT_FOUND` |
| PATCH `/:id` định nghĩa | non-owner 403 `NOT_TASK_OWNER`; owner 200 |
| PATCH `/:id/progress` | non-assignee 403 `NOT_TASK_ASSIGNEE`; assignee 200 |
| PATCH `/:id/assignee` | member 403 `TASK_MEMBER_SELF_ASSIGN_ONLY`; leader 200 |
| DELETE `/:id` | non-owner 403 `NOT_TASK_OWNER`; owner 204, GET sau đó 404 |

> Tasks KHÔNG có guard vai trò ở rìa. Mọi authz là record-level SAU scoped-load, nên member thử reassign
> nhận code cụ thể `TASK_MEMBER_SELF_ASSIGN_ONLY` (thấy được nhưng không được làm), không phải một code
> role-ở-rìa. Đây đúng keystone §3.2.

### 5.5. `email-notifier.spec.ts` (unit) — seam Notifier

| Ca | Kỳ vọng |
|---|---|
| notifyAssigned / notifyReassigned / notifyTasksOrphaned | resolve recipient đúng (tra email qua Prisma theo ID) |
| transporter throw ở cả ba hook | notify* VẪN resolve (bất biến "email không vỡ task-write") |

---

## 6. Throttle 429 — smoke tay

Throttle bị vô hiệu trong lưới e2e để tránh flaky (thời gian cộng trạng thái throttle bleed giữa test).
Verify `RATE_LIMITED` một lần bằng tay. `/auth/login` giới hạn khoảng 5 lần mỗi phút mỗi IP (§6.4), nên
lần thứ 6 trả 429.

```bash
# App chạy: npm run start:dev  (đọc .env → DB dev itms). Rồi bắn 6 request liên tiếp:
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"be.lead@demo.local","password":"wrong"}'
done
# Kỳ vọng: 401 401 401 401 401 429  (5 lần đầu qua throttle, lần 6 bị chặn kèm header Retry-After).
```

Throttle đếm mọi request bất kể pass hay fail, nên mật khẩu sai vẫn tính vào giới hạn.

Queue thông báo và digest quá hạn (Giai đoạn 11 slice 2) đi theo đúng lệ này. Lưới e2e cố ý chạy
không có Redis nên không có queue để mà test, còn digest thì phụ thuộc lịch và trạng thái cộng dồn,
tức đúng loại thứ gây flaky. Phần logic thuần có test unit; phần chạy thật kiểm bằng smoke tay nhiều
instance, ghi ở `docs/11` mục 7.

---

## 7. Quan điểm coverage

Không đặt coverage threshold, không gate CI. Nhất quán `build-plan §6` (coverage-gate cố tình bỏ ở bản
v1: "chuyện của hệ lớn, không phải bản v1 ~3 tuần") và nguyên tắc mục 3 (phủ bất biến, không chạy theo
phần trăm dòng). Vẫn xem được số dòng khi cần bằng `npm run test:cov`, nhưng đó là công cụ tham khảo, không
phải một cổng.

---

## 8. Cách chạy

```bash
docker compose up -d postgres   # Postgres 18 cho DB test (cổng 5433)
npm test                        # unit (jest) — 45 test
npm run test:e2e                # e2e — tạo itms_test, migrate deploy, 42 test
npm run lint                    # gồm 3 cổng cơ học (domain-purity…)
npm run build
```
