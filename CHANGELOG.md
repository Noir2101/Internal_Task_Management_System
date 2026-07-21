# CHANGELOG — ITMS

Lịch sử giai đoạn build. `CLAUDE.md` giữ **luật/bất biến** (thứ còn áp cho code mới);
file này giữ **tường thuật "đã làm gì"** (thứ đã đông cứng). Log chi tiết append-only ở
`deviations-log` / `implementation-log`; nguồn sự thật hợp đồng ở `docs/00–06`.

## Trình tự build (nền ngang trước, lát dọc sau)

Thứ tự thi công backend gốc — dựng nền ngang xong mới lát dọc từng resource:

1. **Walking skeleton:** Nest scaffold · Prisma wire · **migration đầu `--create-only` + 4 raw-SQL** (xem `/migrate`) · seed · global ValidationPipe + exception filter (envelope + **requestId**) · prefix `/api/v1` · Swagger · `GET /health` chạm DB. **Dựng luôn 3 cổng cơ học.**
2. **Auth (thin):** login/refresh-rotate/logout/me · RefreshToken store · rotation + reuse-detection · hashing = argon2 (khớp seed) · JWT guard + claims `sub/role/teamId`. (throttle để bước 7)
3. **Common authz scaffold:** `RolesGuard` + `@Roles()` (role-ở-rìa, `onDeny` hide→404/forbid→403) · `@CurrentUser` · domain-exception `NotFound`/`Forbidden` + map sang HTTP · helper scoped-repo · **JwtAuthGuard global (APP_GUARD) + `@Public()` opt-out** (mọi endpoint mặc-định-bảo-vệ). **KHÔNG `TaskPolicy` ở đây** — nó thuộc Tasks.
4. **Tasks (deep — trái tim, realize keystone):** domain → ports → use-cases → `PrismaTaskRepository` (scoped-load) → interface + DTO + projection. **Keystone-first:** lát mỏng nhất `GET /tasks/:id` qua scoped-load → 404/403 + projection, khoá bằng test, làm template cho mọi endpoint sau. Test-as-you-go CHỈ keystone domain.
5. **Users + Teams (thin):** leader-swap atomic · deactivate → `orphanedTaskCount` + Notifier + **revoke refresh token của user** (đóng deviation Bước 2) · reactivate · CHECK-lên-DTO · roster `GET /teams/:id/members`.
6. **Stats (read-model):** `byProgress` + `byAssignee` outer-join + `overdue`; 3 bất biến OVERDUE; CHỈ qua `TaskQueryPort`.
7. **Hardening:** Prisma-error → HTTP (P2002…) · break-glass `DELETE /teams/:id` + log seam · throttle auth · Swagger polish (4 example khó).

## Các giai đoạn đã hoàn thành

### GĐ1–7 — Backend core ✅
Skeleton + 3 cổng cơ học · auth thin · common authz scaffold · Tasks deep + keystone · Users+Teams thin · Stats read-model · Hardening (Prisma-net + break-glass + throttle + Swagger).

### Extension — Notifications ✅
Seam `Notifier` tốt nghiệp Noop→Email · nodemailer SMTP + Resend · hook notify-on-assign · env `MAIL_ENABLED`/`SMTP_*` (xem `.env.example` + `docs/07.A-notifications.md`).

### GĐ8 — Test hardening ✅
Lưới e2e 42 test trên DB `itms_test` riêng — auth/users/teams/tasks · unit EmailNotifier · truncate+reseed per-test · `configureApp`/`seedDatabase` trích để bật test · throttle vô hiệu trong lưới + smoke tay (xem `docs/08-test-plan.md`).

### GĐ9 — Frontend ✅
Plan `docs/09` + **SPA build đầy đủ ở `web/`** — React+Vite+TS · MUI · TanStack Query · RHF+Zod · React Router · same-origin + Vite proxy · charts Recharts · cả 3 slice đã hiện thực: skeleton+auth / tasks / admin+stats · doc theo `STYLE-GUIDE.md`.

### GĐ10 — Deploy ✅
**Plan (`docs/10`):** Docker Compose full-stack — nginx front-door serve FE tĩnh + reverse-proxy `/api`→backend, KHÔNG rewrite path · backend image multi-stage node:22-alpine · entrypoint `migrate deploy` → seed-if-empty (idempotent, giữ volume) → `node dist/main` · same-origin `http://localhost:8080`, cookie Secure OK vì localhost là secure-context · Swagger giữ mở demo · README một-lệnh; chỉ config, KHÔNG chạm `src/` hay `docs/00–06`; 2 slice.

- **Slice 1 — backend image:** Dockerfile multi-stage node:22-alpine · `scripts/docker-entrypoint.sh` migrate deploy→seed-if-empty→node dist/main · `scripts/seed-if-empty.ts` guard `user.count===0` · compose service `backend` depends_on pg-healthy, không expose host · verify Docker end-to-end xanh.
- **Slice 2 — web front-door:** `web/Dockerfile` multi-stage node→nginx:alpine · `web/nginx.conf` serve SPA + reverse-proxy `/api`→backend KHÔNG rewrite + X-Forwarded + SPA fallback · compose `web` 8080:80 depends_on backend-healthy · README viết lại VN một-lệnh · verify full-stack §11 xanh.

**GĐ10 HOÀN TẤT.**
