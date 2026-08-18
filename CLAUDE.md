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

- NestJS + Postgres + Prisma **pin v6.19** (v7 bỏ `url=env()` → phá schema/seed; đừng bump). (React FE `/web` same-origin — xem `docs/09-frontend-plan.md`.)
- `npm run start:dev` · `npm run lint` · `npm test` · `npm run build`
- FE cùng repo ở `web/`: `cd web && npm run dev` (Vite dev, proxy `/api` sang backend `:3000`).
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
docs/             00–06 spine (nguồn sự thật) · 07-build-plan.md · 07.A-notifications.md · 08-test-plan.md · 09-frontend-plan.md · 10-deploy-plan.md · 11-scaling-redis.md
                  api/ (export OpenAPI tĩnh) · images/ (ảnh Swagger cho README)
perf/             đo tải k6 — seed-scale.ts (5000 task) · tasks-list.js · RESULTS.md (số canonical PERF-01/02)
web/              React SPA — Vite proxy same-origin; api-client refresh-retry-once; token RAM (xem docs/09) · Dockerfile + nginx.conf front-door
STYLE-GUIDE.md    quy ước viết tài liệu kỹ thuật (đính vào session viết docs)
CHANGELOG.md      lịch sử giai đoạn build (GĐ1–11) — tường thuật dời khỏi CLAUDE.md

# Deploy (Docker · kế hoạch docs/10 + docs/11):
Dockerfile        backend image multi-stage node:22-alpine (argon2 build-deps ở builder · openssl ở runtime)
docker-compose.yml postgres + redis + backend + web (front-door); volume itms_pgdata @ /var/lib/postgresql; host :8080
                  backend KHÔNG có container_name (compose từ chối --scale >1 khi có) ⇒ `--scale backend=N` chạy được
scripts/          dev-free-port.mjs · docker-entrypoint.sh (migrate deploy → seed-if-empty → node dist/main) · seed-if-empty.ts
.dockerignore     backend + web/ (loại node_modules · dist · .git · .env · coverage)
README.md         một-lệnh Docker + tech doc ngắn (DOC-02/03)
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

**Scale ngang (GĐ11 · docs/11)**
- Backend stateless: trạng thái dùng chung DUY NHẤT ngoài Postgres là bộ đếm throttle, đặt ở Redis. Đừng thêm state vào RAM tiến trình. [REVIEW]
- Store chọn theo sự có mặt của `REDIS_URL` (`resolveThrottlerStorage`). KHÔNG thêm fallback lặng lẽ về in-memory khi Redis chết — như vậy là tái tạo đúng lỗi vừa sửa (giới hạn nở 5×N). [REVIEW]
- `web/nginx.conf` PHẢI giữ `resolver 127.0.0.11` + **biến** trong `proxy_pass`. Viết thẳng tên host ⇒ đo được 8/8 request dồn vào một replica ⇒ `--scale` thành vô nghĩa, im lặng (healthcheck vẫn xanh cả N). [REVIEW]
- Email thông báo KHÔNG gửi trong đường request khi có `REDIS_URL`: `QueuedNotifier` ghi job, worker gửi. Lớp bọc nằm SAU seam `Notifier` — use-case không được biết có queue. [REVIEW]
- Lịch digest quá hạn nằm ở Redis (repeatable job BullMQ), KHÔNG `@Cron` trong tiến trình — `@Cron` chạy trên cả N replica nên leader nhận N bản trùng. [REVIEW]

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

## Trạng thái

> Backend core (GĐ1–7) + notifications + GĐ8 test + GĐ9 frontend + GĐ10 deploy — **đã ship, hợp đồng GĐ1–10 đông cứng.** GĐ11 (scale ngang) đang chạy theo slice: **slice 1 Redis throttle store + slice 2 BullMQ async email/digest đã ship**; slice 3–4 (pino · audit log) mới phác ở `docs/11 §8`. Tường thuật từng giai đoạn + trình tự build 7 bước → [`CHANGELOG.md`](CHANGELOG.md). Log chi tiết append-only → `deviations-log` / `implementation-log`. Feature mới = giai đoạn tiếp theo: doc kế hoạch đánh số mới (`docs/12-…`) + plan-mode, spine `00–06` chỉ đổi khi cố ý sửa hợp đồng (Luật số 0).
>
> ITMS là **dự án cá nhân** (portfolio/phỏng vấn) — không còn khung "bài nộp"; đừng tái tạo giọng đồ án trong docs mới.

## Lái Claude Code

Trình tự mỗi bước: plan-mode → người review đối chiếu hợp đồng → execute → `/check-spine` → `/sync-docs` (gồm ghi `deviations-log` + `implementation-log` nếu khớp). Chạy nguyên chuỗi này trước **mỗi** commit.
