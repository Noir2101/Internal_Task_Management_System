# CLAUDE.md — Internal Task Management System (ITMS)

> File này là **spine chưng cất** cho Claude Code. Nguồn sự thật đầy đủ ở `docs/00–06`.
> File này KHÔNG thay thế chúng — nó nhắc các bất biến hay trượt nhất và trỏ tới cổng kiểm.
> Khi mâu thuẫn: `docs/` thắng. Luật hexagonal sâu cho Tasks ở `src/tasks/CLAUDE.md`.

## Luật số 0 — spine để ngỏ thì DỪNG, không tự phát minh

Hợp đồng GĐ1–6 đã đông cứng. Nếu code lòi ra một chỗ mà `docs/06-api-contract.md` chưa nói
(ví dụ: default sort của `GET /users`, field nào trong projection của user, một `code` lỗi chưa có
trong registry), **DỪNG và hỏi người** — đừng tự chọn rồi đi tiếp. Tự bịa hợp đồng nguy hơn cãi
một rule đã viết.

## Stack & lệnh

- NestJS + Postgres + Prisma **pin v6.19** (v7 bỏ `url=env()` → phá schema/seed; đừng bump). (React FE `/web` same-origin — GĐ9, xem `docs/09-frontend-plan.md`.)
- `npm run start:dev` · `npm run lint` · `npm test` · `npm run build`
- FE cùng repo ở `web/`: `cd web && npm run dev` (Vite dev, proxy `/api` sang backend `:3000`). Chưa scaffold — build từ Slice 1.
- Prisma: dùng `/migrate`. KHÔNG `prisma db push`, KHÔNG `prisma migrate reset`.
- Prefix tĩnh `/api/v1`. Swagger ở `/api/v1/docs`.

## Layout

```
src/
  common/         guards, exception filter, envelope, requestId, pagination, Clock, base exceptions
  auth/           thin   — login/refresh-rotate/logout/me, JWT guard + claims
  tasks/          DEEP   — domain/ application/ infrastructure/ interface/   (xem src/tasks/CLAUDE.md)
  users/          thin   — admin CRUD, deactivate/reactivate
  teams/          thin   — CRUD, leader-swap atomic, roster members
  stats/          thin   — read-model, CHỈ qua TaskQueryPort
prisma/           schema.prisma · seed.ts · migrations/
docs/             00–06 spine (nguồn sự thật) · 07-build-plan.md · 09-frontend-plan.md · 10-deploy-plan.md
web/              React SPA (GĐ9) — Vite proxy same-origin; api-client refresh-retry-once; token RAM (xem docs/09) · (GĐ10) Dockerfile + nginx.conf front-door
STYLE-GUIDE.md    quy ước viết tài liệu kỹ thuật (đính vào session viết docs)

# GĐ10 deploy (kế hoạch docs/10 · chỉ config, build ở slice sau):
Dockerfile        backend image multi-stage node:22-alpine (argon2 build-deps ở builder · openssl ở runtime)
docker-compose.yml postgres + backend + web (front-door); volume itms_pgdata @ /var/lib/postgresql; host :8080
scripts/          dev-free-port.mjs · (GĐ10) docker-entrypoint.sh (migrate deploy → seed-if-empty → node dist/main) · seed-if-empty.ts
.dockerignore     backend + web/ (loại node_modules · dist · .git · .env · coverage)
README.md         (GĐ10) một-lệnh Docker + tech doc ngắn (DOC-02/03) — viết lại từ boilerplate
```

`users/` và `teams/` tách đôi cho khớp resource trong hợp đồng; gộp thành một `org/` cũng được nếu muốn.

## Bất biến

Nhãn: **[GATE]** = cổng cơ học (lint/test/provider) fail nếu vi phạm · **[REVIEW]** = `/check-spine` soi tay.

**Authz / keystone**
- Phạm vi do server suy từ JWT `teamId`; client KHÔNG gửi scope/`teamId`. `GET /tasks` không có param `teamId`. [REVIEW]
- Ngoài phạm vi → 404 `RESOURCE_NOT_FOUND` (giấu tồn tại). Trong phạm vi sai quyền → 403 code cụ thể. [GATE: keystone test]
- record-level qua `TaskPolicy` (owner / assignee / cùng-nhóm), không chỉ guard role. [REVIEW]
- one-law-per-endpoint: `PATCH /:id` owner (định nghĩa) · `/progress` assignee · `/assignee` leader (reassign) · `DELETE` owner. [REVIEW]
- reassign = leader-only; member chỉ tự-giao lúc tạo, không bao giờ đổi assignee. [REVIEW]
- field server-suy-ra KHÔNG vào body (`ownerId` từ `sub`, scope từ `teamId`) — chống mass-assignment. [REVIEW]

**Mô hình task**
- OVERDUE = computed (`deadline < now AND progress != DONE`). KHÔNG cột, KHÔNG status thứ tư, KHÔNG bucket trong `byProgress`. [GATE: test]
- Một `now` duy nhất mỗi request: cờ `overdue` và filter `?overdue=` cùng nguồn (`Clock` provider). [GATE: Clock + test]
- `progress` KHÔNG có máy trạng thái (bất kỳ → bất kỳ; assignee đổi). [REVIEW]
- ownership ≠ assignment; một task đúng một assignee cá nhân. [GATE: test]
- scope task = nhóm của assignee, suy ra. KHÔNG cột `teamId` trên Task. [REVIEW]

**Tách tầng**
- `tasks/domain/**` KHÔNG import `@prisma/client` hay `@nestjs/*`. [GATE: ESLint]
- DIP / port CHỈ ở Tasks. Auth/Users/Teams inject repo cụ thể — đừng thêm port. [REVIEW]
- Stats CHỈ đọc qua `TaskQueryPort`; không Prisma trực tiếp trong `stats/`; không phụ thuộc module Users. [GATE: ESLint + REVIEW]
- Response là **projection**, KHÔNG serialize model Prisma. Không bao giờ lộ `passwordHash`, `tokenHash`, field RefreshToken, `Task.deletedAt`, `teamId` của task. `owner`/`assignee` chỉ `{id,name}`. [GATE: projection test + REVIEW]

**Lifecycle**
- User `isActive` (đảo được); Task `deletedAt` (tombstone). Default scope loại bản ghi xoá/inactive. [REVIEW]
- `teamId` của user bất biến sau tạo; role chỉ đổi qua `PUT /teams/:id/leader` (atomic swap). [REVIEW]
- Chặn deactivate leader chưa có người thay → 409 `LEADER_REPLACEMENT_REQUIRED`. [REVIEW]

**Convention hợp đồng**
- Envelope `{statusCode,error,code,message,timestamp,path,requestId}`. FE rẽ nhánh CHỈ trên `code`. `details[]` chỉ cho `VALIDATION_FAILED`. [REVIEW]
- Status chỉ 400/403/409 (+ 401/404/429/500). KHÔNG 422. [REVIEW]
- DTO chỉ validation hình thức; luật nghiệp vụ ở domain/use-case. [REVIEW]
- cuid2 opaque · camelCase · ISO-8601 UTC (`timestamptz`). [REVIEW]

## Cổng cơ học (phải tồn tại + xanh; `/check-spine` kiểm)

1. **Domain purity** — ESLint `no-restricted-imports` chặn `tasks/domain/**` chạm Prisma/Nest, và `stats/**` chạm `@prisma/client`. Vi phạm = lỗi lint.
2. **Projection default-deny** — mapper whitelist field (`excludeExtraneousValues`) cho mọi response; test assert field cấm không bao giờ lộ.
3. **Clock provider** — một nguồn `now()` inject được; OVERDUE (cờ + filter) dùng chung nó; test bơm clock cố định.

Snippet khởi tạo ba cổng: `docs/07-build-plan.md` §2.

## Trình tự build (nền ngang trước, lát dọc sau)

> Trạng thái: **Bước 1–7 ✅ — GĐ7 backend HOÀN TẤT** (skeleton + 3 cổng · auth thin · common authz scaffold · Tasks deep + keystone · Users+Teams thin · Stats read-model · Hardening: Prisma-net + break-glass + throttle + Swagger). **+ extension: notifications ✅** (seam `Notifier` tốt nghiệp Noop→Email · nodemailer SMTP + Resend · hook notify-on-assign · env `MAIL_ENABLED`/`SMTP_*` xem `.env.example` + `docs/07.A-notifications.md`). **+ GĐ8: test hardening ✅** (lưới e2e 42 test trên DB `itms_test` riêng — auth/users/teams/tasks · unit EmailNotifier · truncate+reseed per-test · `configureApp`/`seedDatabase` trích để bật test · throttle vô hiệu trong lưới + smoke tay · xem `docs/08-test-plan.md`). **+ GĐ9: frontend plan ✅** (docs/09 — React+Vite+TS · MUI · TanStack Query · RHF+Zod · React Router · same-origin /web + Vite proxy · charts Recharts · 3 slice: skeleton+auth/tasks/admin+stats · doc theo `STYLE-GUIDE.md`). **+ GĐ10: deploy plan ✅** (docs/10 — Docker Compose full-stack: nginx front-door serve FE tĩnh + reverse-proxy `/api`→backend, KHÔNG rewrite path · backend image multi-stage node:22-alpine · entrypoint `migrate deploy` → seed-if-empty (idempotent, giữ volume) → `node dist/main` · same-origin `http://localhost:8080`, cookie Secure OK vì localhost là secure-context · Swagger giữ mở demo · README một-lệnh; chỉ config, KHÔNG chạm `src/` hay `docs/00–06`; 2 slice). **+ GĐ10 Slice 1: backend image ✅** (Dockerfile multi-stage node:22-alpine · `scripts/docker-entrypoint.sh` migrate deploy→seed-if-empty→node dist/main · `scripts/seed-if-empty.ts` guard `user.count===0` · compose service `backend` depends_on pg-healthy, không expose host · verify Docker end-to-end xanh). Kế: **build Slice 2** (web nginx front-door + reverse-proxy + README một-lệnh).

1. **Walking skeleton:** Nest scaffold · Prisma wire · **migration đầu `--create-only` + 4 raw-SQL** (xem `/migrate`) · seed · global ValidationPipe + exception filter (envelope + **requestId**) · prefix `/api/v1` · Swagger · `GET /health` chạm DB. **Dựng luôn 3 cổng cơ học.**
2. **Auth (thin):** login/refresh-rotate/logout/me · RefreshToken store · rotation + reuse-detection · hashing = argon2 (khớp seed) · JWT guard + claims `sub/role/teamId`. (throttle để bước 7)
3. **Common authz scaffold:** `RolesGuard` + `@Roles()` (role-ở-rìa, `onDeny` hide→404/forbid→403) · `@CurrentUser` · domain-exception `NotFound`/`Forbidden` + map sang HTTP · helper scoped-repo · **JwtAuthGuard global (APP_GUARD) + `@Public()` opt-out** (mọi endpoint mặc-định-bảo-vệ). **KHÔNG `TaskPolicy` ở đây** — nó thuộc Tasks.
4. **Tasks (deep — trái tim, realize keystone):** domain → ports → use-cases → `PrismaTaskRepository` (scoped-load) → interface + DTO + projection. **Keystone-first:** lát mỏng nhất `GET /tasks/:id` qua scoped-load → 404/403 + projection, khoá bằng test, làm template cho mọi endpoint sau. Test-as-you-go CHỈ keystone domain.
5. **Users + Teams (thin):** leader-swap atomic · deactivate → `orphanedTaskCount` + Notifier + **revoke refresh token của user** (đóng deviation Bước 2) · reactivate · CHECK-lên-DTO · roster `GET /teams/:id/members`.
6. **Stats (read-model):** `byProgress` + `byAssignee` outer-join + `overdue`; 3 bất biến OVERDUE; CHỈ qua `TaskQueryPort`.
7. **Hardening:** Prisma-error → HTTP (P2002…) · break-glass `DELETE /teams/:id` + log seam · throttle auth · Swagger polish (4 example khó).

## Lái Claude Code

Trình tự mỗi bước: plan-mode → người review đối chiếu hợp đồng → execute → `/check-spine` → `/sync-docs` (gồm ghi `deviations-log` + `implementation-log` nếu khớp). Chạy nguyên chuỗi này trước **mỗi** commit.
