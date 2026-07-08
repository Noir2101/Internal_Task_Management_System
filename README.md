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
        │  backend (node:22)      │   NestJS, prefix /api/v1
        │  entrypoint: migrate    │   → seed-if-empty → node dist/main
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │  postgres:18            │   volume itms_pgdata → /var/lib/postgresql
        └─────────────────────────┘
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

### Ghi chú demo
- **Swagger để mở** ở `/api/v1/docs` chỉ để demo;
  prod nên gate sau một cờ môi trường.
- **Throttle bật** ở prod (login ~5 lần/phút/IP); `THROTTLE_DISABLED` chỉ dành cho e2e.
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
