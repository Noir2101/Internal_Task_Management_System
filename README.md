# ITMS — Hệ thống quản lý công việc nội bộ

> Internal Task Management System — backend NestJS + Postgres (Prisma) và frontend React (Vite),
> đóng gói chạy bằng **một lệnh** Docker Compose. Toàn bộ chạy same-origin sau một cửa trước nginx.

---

## Chạy bằng một lệnh

Yêu cầu: Docker Desktop (hoặc Docker Engine + Compose v2).

```bash
docker compose up -d --build
```

Lần đầu, container backend tự **migrate** rồi **seed dữ liệu mẫu** (chỉ khi DB rỗng). Khi cả ba
container khoẻ, mở:

- Ứng dụng: **http://localhost:8080**
- API docs (Swagger): **http://localhost:8080/api/v1/docs**

Tài khoản seed (mật khẩu chung `Password123!`):

| Email | Vai trò | Nhóm |
|---|---|---|
| `admin@demo.local` | ADMIN | — |
| `be.lead@demo.local` | LEADER | Backend |
| `be.a@demo.local` · `be.b@demo.local` | MEMBER | Backend |
| `fe.lead@demo.local` | LEADER | Frontend |
| `fe.a@demo.local` | MEMBER | Frontend |

Dừng / dọn:

```bash
docker compose down       # dừng, GIỮ dữ liệu (volume còn) — up lại là chạy tiếp
docker compose down -v    # dừng và XOÁ volume → lần up sau seed lại từ đầu
```

Dữ liệu bền qua restart nhờ volume `itms_pgdata`; seed có guard `user.count()==0` nên restart không
ghi đè dữ liệu bạn tạo.

### Chạy nhiều instance backend

Backend không giữ trạng thái riêng, nên thêm replica là đủ để chia tải:

```bash
docker compose up -d --build --scale backend=2
```

Bộ đếm throttle nằm ở Redis chứ không ở RAM tiến trình, nên giới hạn "5 lần login mỗi phút mỗi IP"
giữ nguyên dù chạy bao nhiêu replica. Kiểm nhanh — request thứ 6 phải trả 429:

```bash
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:8080/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@demo.local","password":"wrong"}'
done; echo
# 401 401 401 401 401 429
```

Chi tiết cách làm và số đo đầy đủ ở [`docs/11-scaling-redis.md`](docs/11-scaling-redis.md).

---

## Kiến trúc

Ba container trên một mạng nội bộ. Chỉ nginx lộ cổng ra host; backend và Postgres không expose ra
ngoài. Trình duyệt chỉ thấy một origin (`http://localhost:8080`) nên cookie refresh (`Path=/api/v1/auth`)
gửi đúng chỗ và không dính CORS.

```
                 host :8080
                     │
        ┌────────────▼────────────┐
        │   web  (nginx:alpine)   │   front-door
        │  /       → SPA (dist)   │   (serve static)
        │  /api/*  → backend:3000 │   (reverse-proxy, KHÔNG rewrite path)
        └────────────┬────────────┘
                     │  mạng nội bộ itms
        ┌────────────▼────────────┐
        │  backend (node:22) ×N   │   NestJS, prefix /api/v1 — stateless, scale được
        │  entrypoint: migrate    │   → seed-if-empty → node dist/main
        └───────┬─────────┬───────┘
                │         │
   ┌────────────▼──┐   ┌──▼───────────────┐
   │  postgres:18  │   │  redis:8-alpine  │   store throttle dùng chung
   │  volume       │   │  không persist   │   (bộ đếm hết hạn 60s)
   │  itms_pgdata  │   └──────────────────┘
   └───────────────┘
```

**Stack:** NestJS · Prisma · PostgreSQL 18 · argon2 (backend) — React · Vite · TypeScript · MUI ·
TanStack Query · React Router · Recharts (frontend).

---

## Tài liệu kỹ thuật (tóm tắt)

### Schema
Bốn model: `User`, `Team`, `Task`, `RefreshToken`. Điểm chính:
- Admin đứng ngoài cây tổ chức (`teamId` NULL); leader/member thuộc đúng một nhóm.
- Task có `owner` và `assignee` (một assignee cá nhân); **không** có cột `teamId` — phạm vi suy từ
  nhóm của assignee.
- **OVERDUE là computed** (`deadline < now AND progress != DONE`), không phải cột hay trạng thái thứ tư.
- User dùng `isActive` (đảo được); Task dùng `deletedAt` (tombstone).

### Quyết định chính
- **Hợp đồng API đông cứng** — mọi lỗi trả cùng một envelope `{statusCode,error,code,message,…}`;
  frontend rẽ nhánh chỉ trên `code`.
- **Phân quyền keystone** — phạm vi suy từ JWT (`teamId`), client không gửi scope; ngoài phạm vi →
  404 (giấu tồn tại), sai quyền trong phạm vi → 403; record-level qua `TaskPolicy`.
- **Kiến trúc hexagonal ở module Tasks** (domain thuần, port/adapter).
- **Triển khai** — nginx front-door giữ same-origin (không chạm mã backend); entrypoint
  `migrate deploy → seed-if-empty → node dist/main`.
- **Mở rộng ngang** — backend stateless; trạng thái dùng chung duy nhất ngoài Postgres là bộ đếm
  throttle, đặt ở Redis. nginx phân giải tên qua DNS Docker lúc chạy nên nhận đủ mọi replica.
- **Việc nền qua hàng đợi** — email thông báo rời khỏi đường request sang worker BullMQ (`POST /tasks`
  đo được từ ~2,75 giây xuống ~11 mili giây), cộng một job định kỳ gửi leader thư tổng hợp task quá
  hạn. Lịch nằm ở Redis nên chạy bao nhiêu replica cũng chỉ gửi một lần.

### Ghi chú demo
- **Swagger để mở** ở `/api/v1/docs` chỉ để demo;
  prod nên gate sau một cờ môi trường.
- **Throttle bật** ở prod (login ~5 lần/phút/IP); `THROTTLE_DISABLED` chỉ dành cho e2e.
  Bộ đếm ở Redis khi có `REDIS_URL` (compose tự đặt), rơi về in-memory khi không có — nên `npm test`
  và `npm run start:dev` không cần Redis.
- **Hàng đợi thông báo** cũng bật theo chính `REDIS_URL` đó. Không có Redis thì email gửi thẳng trong
  request như trước và không có digest, nên dev với test vẫn chạy được mà không cần dựng gì thêm.
  Lịch digest mặc định 01:00 UTC, đổi bằng `OVERDUE_DIGEST_CRON`.
- **Cookie `Secure`** bật (`NODE_ENV=production`) và vẫn chạy qua `http://localhost` vì `localhost` là
  secure-context. Truy cập qua IP LAN nằm ngoài phạm vi demo.
- Bí mật đi qua biến môi trường (xem [`.env.example`](.env.example)); giá trị mặc định trong compose là
  secret **DEMO**, override bằng `.env` tại chỗ khi cần.

---

## Phát triển (không Docker)

```bash
# Backend (cần Postgres — có thể dùng `docker compose up -d postgres`)
cp .env.example .env        # điền DATABASE_URL + JWT_ACCESS_SECRET
npm install
npm run start:dev           # http://localhost:3000/api/v1

# Frontend (đề xuất chạy song song; Vite proxy /api → :3000)
cd web && npm install && npm run dev   # http://localhost:5173
```

---

## Lịch sử

Tường thuật các giai đoạn build (GĐ1–11) ở [`CHANGELOG.md`](CHANGELOG.md); luật/bất biến kiến trúc ở [`CLAUDE.md`](CLAUDE.md), spine đầy đủ ở `docs/00–06`.
