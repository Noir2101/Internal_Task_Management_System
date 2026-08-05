# Giai đoạn 10 — Kế hoạch triển khai (Docker Compose full-stack)

> Hệ thống quản lý công việc nội bộ (Internal Task Management System)
> Tài liệu này là mini-design cho **đóng gói và triển khai**. Nó KHÔNG định nghĩa lại luật nghiệp vụ
> và KHÔNG sửa hợp đồng đã đông cứng (`docs/00–06`). Đây là lớp cấu hình triển khai (deployment
> config) đặt lên trên một hệ thống đã hoàn chỉnh: backend Giai đoạn 7–8 và frontend Giai đoạn 9 đều
> đã lên `main`, e2e xanh.
> Như các tài liệu trước, nó ghi rõ lý do và đánh đổi cho mỗi quyết định lớn.
> Stack triển khai: Docker Compose, Postgres 18, Nginx, image Node đa tầng (multi-stage).

---

## Bảng thuật ngữ

| Thuật ngữ | Nghĩa ngắn |
|---|---|
| reverse-proxy (proxy đảo chiều) | Một máy chủ đứng trước, nhận mọi request của trình duyệt rồi route nội bộ: phần tĩnh trả thẳng, phần `/api` chuyển tiếp sang backend. Trình duyệt chỉ thấy một origin. |
| same-origin (cùng nguồn gốc) | Frontend và API phục vụ trên cùng một origin. Nhờ vậy cookie `Path` chạy đúng và không dính CORS. |
| front-door (cửa trước) | Container Nginx là điểm vào duy nhất lộ ra host; backend và Postgres nằm trong mạng nội bộ, không expose. |
| multi-stage build (build đa tầng) | Dockerfile chia làm tầng builder (biên dịch, cài build-deps nặng) và tầng runtime (chỉ chứa artifact chạy). Image cuối nhỏ và không mang theo toolchain. |
| entrypoint (điểm khởi động) | Script chạy đầu tiên khi container backend lên, trước khi vào tiến trình chính. Ở đây nó lo migrate rồi seed rồi mới `node dist/main`. |
| `migrate deploy` | Lệnh Prisma áp các migration đã commit theo đúng thứ tự, không sinh migration mới, không xoá dữ liệu. Đây là lệnh migrate an toàn cho môi trường thật. |
| seed-if-empty (seed khi rỗng) | Chỉ nạp dữ liệu mẫu khi database chưa có user nào. Tránh ghi đè dữ liệu thật ở mỗi lần khởi động lại. |
| volume (ổ lưu bền) | Vùng lưu trữ do Docker quản lý, tồn tại độc lập với vòng đời container. Data Postgres nằm ở đây nên restart không mất. |
| secure-context (ngữ cảnh an toàn) | Tiêu chí trình duyệt để chấp nhận cookie có cờ `Secure`. `localhost` và HTTPS đều là secure-context; một địa chỉ IP LAN qua http thì không. |
| idempotent (bất biến khi lặp) | Chạy nhiều lần cho kết quả như chạy một lần. `migrate deploy` idempotent theo thiết kế; seed được bọc guard để cũng idempotent ở tầng khởi động. |

---

## 1. Mục tiêu và phạm vi

Giai đoạn 10 là phần **bắt buộc còn lại** của bản v1. Nó đóng gói toàn hệ thống để chạy bằng một
lệnh và viết lại tài liệu vận hành. Không có tính năng nghiệp vụ mới.

### 1.1. Yêu cầu ánh xạ

| Yêu cầu | Nội dung | Giải bằng |
|---|---|---|
| NFR-DEPLOY-01 | Toàn hệ thống (backend, DB, frontend) chạy bằng Docker Compose, cấu hình tối thiểu | Một `docker-compose.yml` gộp ba service; một lệnh `docker compose up` |
| NFR-DEPLOY-02 | Data DB bền vững qua volume, không mất khi restart | Volume `itms_pgdata`; seed có guard nên restart không ghi đè |
| NFR-DEPLOY-03 | Có cơ chế seed để chấm/demo: 1 admin, vài nhóm, vài task | Entrypoint chạy seed-if-empty, tái dùng `seedDatabase` sẵn có (1 admin, 2 nhóm, 6 user, 8 task) |
| DOC-02 | README hướng dẫn chạy bằng một lệnh Docker Compose | Viết lại `README.md` |
| DOC-03 | Tài liệu kỹ thuật ngắn: kiến trúc, schema, quyết định chính | Phần "tech doc" trong README, link tới `docs/01–06` và tài liệu này |

### 1.2. Ranh giới — chỉ config, không chạm lõi

Toàn bộ Giai đoạn 10 chỉ thêm file cấu hình triển khai. Một bất biến xuyên suốt: **không sửa hợp
đồng đã đông cứng và không đổi luật nghiệp vụ.** Không sửa `docs/00–06`. Không sửa mã backend trong
`src/`. Các quyết định dưới đây được chọn một phần vì chúng giữ được ranh giới này.

### 1.3. Bảy quyết định đã chốt

| # | Quyết định | Chọn | Lý do gọn |
|---|---|---|---|
| 1 | Hình thái same-origin ở prod | Nginx front-door | Giữ same-origin, không chạm mã backend (xem §3) |
| 2 | Migrate và seed lúc khởi động | migrate deploy + seed-if-empty | Thoả cả NFR-DEPLOY-02 lẫn 03 (xem §5) |
| 3 | Cookie Secure và TLS | Demo qua http://localhost | localhost là secure-context, không đổi mã (xem §8.2) |
| 4 | Swagger ở prod | Giữ mở, có ghi chú | Người chạy thử cần truy cập; đúng docs/06 §11 (xem §8.3) |
| 5 | Base image | node:22-alpine multi-stage | Image nhỏ; fallback node:22-slim nếu argon2 kẹt (xem §4) |
| 6 | Cổng và phạm vi compose | Host 8080, một file compose | Chỉ Nginx lộ ra ngoài (xem §7) |
| 7 | Chia slice | 2 slice | Slice 1 backend, Slice 2 frontend cộng README (xem §10) |

---

## 2. Kiến trúc triển khai — tổng thể

Ba container trên một mạng Docker nội bộ. Chỉ Nginx lộ cổng ra host. Backend và Postgres không
expose ra ngoài, chỉ gọi được từ trong mạng.

```
                 host :8080
                     │
        ┌────────────▼────────────┐
        │   web  (nginx:alpine)   │   front-door
        │  /       → FE dist      │   (serve static)
        │  /api/*  → backend:3000 │   (reverse-proxy, KHÔNG rewrite path)
        └────────────┬────────────┘
                     │  mạng nội bộ itms
        ┌────────────▼────────────┐
        │  backend (node:22)      │   API NestJS, prefix /api/v1
        │  entrypoint: migrate    │   → seed-if-empty → node dist/main
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │  postgres:18            │   volume itms_pgdata → /var/lib/postgresql
        └─────────────────────────┘
```

Trình duyệt chỉ thấy một origin là `http://localhost:8080`. Nhờ đó cookie refresh với
`Path=/api/v1/auth` gửi đúng chỗ và không phát sinh CORS.

---

## 3. Quyết định 1 — Nginx front-door thay vì backend serve static

Có ba cách để FE tĩnh và `/api` cùng nằm trên một origin. Bảng đánh đổi:

| Trục | Nginx front-door (ĐÃ CHỐT) | Backend serve static | Hai origin cộng CORS |
|---|---|---|---|
| Cách làm | Nginx serve `dist` và proxy `/api` sang backend | Thêm `ServeStaticModule`, Nest tự serve `dist` | FE và backend lộ cổng riêng |
| Chạm mã backend | Không | Có: thêm dependency cộng sửa `app.module.ts` | Không, nhưng phải bật CORS |
| Same-origin | Giữ nguyên | Giữ nguyên | Vỡ: cookie `Path` không gửi được, cần CORS |
| Số container | 3 | 2 | 3 |
| Ăn khớp seam sẵn có | Đúng docs/09 §4 (reverse-proxy để dành) | Lệch hướng đã ghi | Trái bất biến same-origin |

Chốt **Nginx front-door**. Lý do quyết định là nó **không chạm một dòng mã backend nào**, nên giữ
đúng ranh giới "chỉ config" ở §1.2. Phương án backend-serve-static tuy gọn còn hai container nhưng
buộc thêm `@nestjs/serve-static` và sửa `app.module.ts`. Đó là thay đổi mã nguồn cho một mục tiêu
thuần triển khai, không đáng. Phương án hai origin bị loại thẳng vì nó phá same-origin, kéo theo mất
cookie `Path` và phải mở CORS.

> Đường cắt để sẵn: docs/09 §4 đã dự trù đúng hình thái này. Tách repo về sau chỉ cần đặt reverse-proxy
> route `/api/*` về backend và `/*` về FE. Bản triển khai này hiện thực hoá đúng cái seam đó.

---

## 4. Image backend — multi-stage node:22-alpine

Backend đóng thành image đa tầng để tách toolchain build khỏi artifact chạy.

**Tầng builder.** Cài build-deps native (`python3`, `make`, `g++`) để **argon2** biên dịch cho môi
trường musl của Alpine. Chạy `npm ci`, `prisma generate`, rồi `nest build` ra `dist`.

**Tầng runtime.** Chỉ giữ `openssl` (Prisma cần cho query engine `linux-musl-openssl-3.0.x`) cộng
các artifact chạy. Copy sang: `dist`, `node_modules`, thư mục `prisma/` (schema, migrations, seed),
và `package.json`.

Một điểm cần nói rõ vì nó ngược trực giác "runtime chỉ chứa hàng prod". Tầng runtime ở đây **không
phải prod-only**. Nó phải mang thêm ba thứ vốn là devDependency: Prisma CLI (để entrypoint chạy
`migrate deploy`), `tsx` (để chạy seed viết bằng TypeScript), và bản `@prisma/client` đã generate.
Lý do là entrypoint cần migrate cộng seed trước khi vào tiến trình chính. Đánh đổi là image lớn hơn
vài chục MB. Ở một dự án demo, đây là đổi hợp lý để lấy một entrypoint tự lo được mọi việc.

> Lưu ý kỹ thuật: chạy `prisma generate` ở tầng builder trên **cùng base image** với runtime. Cả
> hai đều Alpine nên query engine sinh ra khớp đúng nền musl khi copy `node_modules` sang. Nếu builder
> và runtime lệch nền, engine sẽ sai và Prisma báo lỗi lúc chạy.

**Fallback đã ghi.** Nếu argon2 build trên musl trục trặc ở máy người chạy thử, đổi base sang
`node:22-slim` (nền Debian, glibc). Ở đó argon2 có prebuilt binary nên không phải biên dịch từ nguồn.
Đổi lại image to hơn. Đây là phương án dự phòng, không phải mặc định.

---

## 5. Entrypoint — migrate rồi seed-if-empty rồi chạy

Container backend khởi động qua một script entrypoint chạy đúng ba bước, theo thứ tự:

```
1. prisma migrate deploy          # áp mọi migration đã commit; idempotent; KHÔNG reset/push
2. seed nếu user.count() == 0     # guard: chỉ seed khi database rỗng
3. node dist/main                 # vào tiến trình API
```

### 5.1. Vì sao phải có guard seed

`prisma/seed.ts` là seed **kiểu reset**. Nó `deleteMany` sạch bốn bảng rồi tạo lại ma trận fixture.
Nếu entrypoint seed vô điều kiện ở mỗi lần khởi động, mỗi restart sẽ xoá sạch dữ liệu người dùng vừa
tạo. Điều đó mâu thuẫn trực tiếp với NFR-DEPLOY-02 (data bền qua restart).

Guard giải mâu thuẫn này. Trước khi seed, script đếm số user. Nếu bằng không thì database còn trống,
seed chạy. Nếu lớn hơn không thì đã có dữ liệu, seed bỏ qua. Bảng hành vi:

| Tình huống | user.count() | Hành động | Kết quả |
|---|---|---|---|
| Lần đầu `up` (volume mới) | 0 | seed chạy | Có dữ liệu demo |
| Restart backend | lớn hơn 0 | seed bỏ qua | Dữ liệu người dùng CÒN NGUYÊN |
| `down -v` rồi `up` (volume xoá) | 0 | seed chạy | Reseed sạch, demo lại được |

Nhờ guard, một entrypoint duy nhất thoả **cả** NFR-DEPLOY-02 lẫn NFR-DEPLOY-03. Người chạy thử chỉ cần một
lệnh là có demo; restart không mất việc; muốn về trạng thái sạch thì `down -v`.

### 5.2. Guard sống ngoài seed, không sửa luật seed

Guard hiện thực bằng một script triển khai riêng, ví dụ `scripts/seed-if-empty.ts`. Script này
**tái dùng hàm `seedDatabase` đã export** trong `prisma/seed.ts`, chỉ bọc thêm một lần đếm user. Nó
KHÔNG sửa hành vi reset của `seed.ts`. Đây là công cụ triển khai đặt bên ngoài, không phải thay đổi
luật nghiệp vụ. Ranh giới §1.2 vẫn giữ.

### 5.3. Kỷ luật Prisma

Entrypoint chỉ dùng `migrate deploy`. Tuyệt đối không `prisma migrate reset`, không `prisma db push`
(đúng CLAUDE.md và skill `/migrate`). Prisma pin v6.19 nên `url=env()` còn dùng được cho
`DATABASE_URL`. Ở container, `DATABASE_URL` trỏ host `postgres` (tên service), không phải
`localhost:5433`.

---

## 6. Image frontend — build Node rồi phục vụ bằng Nginx

Frontend đóng thành image đa tầng: tầng build biên dịch, tầng phục vụ chỉ có web server tĩnh.

**Tầng build.** `node:22-alpine`. Trong `web/` chạy `npm ci` rồi `npm run build` (đã có `tsc -b &&
vite build` trong `web/package.json`) ra thư mục `dist`.

**Tầng phục vụ.** `nginx:alpine`. Copy `dist` vào thư mục web root và nạp một `nginx.conf` tự viết.
Config làm ba việc:

```nginx
location /api/ {
    proxy_pass http://backend:3000;   # KHÔNG dấu / cuối → giữ nguyên URI, không rewrite path
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location / {
    try_files $uri /index.html;       # SPA fallback cho React Router
}
```

Ba điểm phải giữ đúng:

- **Không rewrite path.** `proxy_pass` để nguyên tiền tố `/api/v1`. Đây là đúng hành vi của proxy
  Vite lúc dev (`vite.config.ts` không rewrite). Giữ tiền tố thì trình duyệt thấy cookie refresh ở
  `Path=/api/v1/auth` nên gửi lại đúng khi gọi `/auth/refresh` và `/auth/logout`. Rewrite path sẽ
  phá đúng chỗ này.
- **Forward header X-Forwarded.** Backend đặt `trust proxy: 1` (xem `src/app-config.ts`). Nginx phải
  chuyển `X-Forwarded-For` và `X-Forwarded-Proto` để throttle key theo IP thật của client, không
  phải IP của proxy.
- **SPA fallback.** React Router dùng route phía client. Mọi path không phải file tĩnh phải trả
  `index.html` để router xử lý, nếu không reload trang con sẽ ra 404.

---

## 7. Compose — một file, ba service

Viết lại `docker-compose.yml` từ bản chỉ-có-Postgres thành bản gộp ba service.

| Service | Image | Cổng | Phụ thuộc | Ghi chú |
|---|---|---|---|---|
| postgres | postgres:18 | 5433→5432 (chỉ để debug) | — | Giữ nguyên volume `itms_pgdata` mount `/var/lib/postgresql`; healthcheck `pg_isready` |
| backend | build từ `Dockerfile` | không expose | postgres (điều kiện `service_healthy`) | env từ file; `NODE_ENV=production`; entrypoint migrate cộng seed |
| web | build từ `web/Dockerfile` | 8080→80 | backend | Nginx front-door; điểm vào duy nhất |

Quyết định cổng và phạm vi (quyết định 6). Chỉ Nginx publish ra host, ở cổng `8080` để tránh đụng
`80` và `3000` thường bận trên máy dev. Một file `docker-compose.yml` duy nhất gộp cả ba, đúng tinh
thần "cấu hình tối thiểu" của NFR-DEPLOY-01. Cổng `5433→5432` của Postgres giữ lại chỉ để soi
database khi cần, không phải đường đi của ứng dụng.

`backend` chờ `postgres` khoẻ rồi mới khởi động, qua `depends_on` với điều kiện `service_healthy`.
Nhờ vậy `migrate deploy` không chạy trúng lúc Postgres chưa nhận kết nối.

Volume `itms_pgdata` giữ nguyên như bản hiện tại. Mount ở `/var/lib/postgresql` chứ không phải
`/data`. Đây là bất biến đã ghi trong bộ nhớ dự án: Postgres 18 lưu data ở subdir theo major version
nên phải mount ở thư mục cha, mount `/data` thì container 18 từ chối khởi động.

---

## 8. Cấu hình và bí mật

### 8.1. Ma trận biến môi trường

Backend đọc các biến sau. Mở rộng `.env.example` để liệt kê đủ cho bản compose.

| Biến | Vai trò | Ghi chú triển khai |
|---|---|---|
| `DATABASE_URL` | Chuỗi kết nối Prisma | Ở container trỏ host `postgres`, không phải `localhost:5433` |
| `JWT_ACCESS_SECRET` | Ký access token | Chuỗi ngẫu nhiên đủ dài; qua env, không commit |
| `JWT_ACCESS_TTL` | Hạn access token | Mặc định `15m` |
| `REFRESH_TTL_DAYS` | Hạn refresh token | Mặc định `7` |
| `NODE_ENV` | Chế độ chạy | Đặt `production` (xem §8.2) |
| `PORT` | Cổng backend nội bộ | Mặc định `3000`; `main.ts` đã đọc |
| `MAIL_ENABLED`, `SMTP_*`, `MAIL_FROM` | Notifications (bonus) | Để `MAIL_ENABLED=false` là an toàn cho demo |

Bí mật đi qua env, không bao giờ commit `.env` thật. File `.env` đã nằm trong `.gitignore`. Compose
đọc giá trị thật từ một `.env` do người vận hành tạo tại chỗ.

### 8.2. Quyết định 3 — cookie Secure qua http://localhost

Cookie refresh đặt cờ `Secure` khi `NODE_ENV === 'production'` (xem `src/auth/refresh-cookie.ts`).
Bản compose đặt `NODE_ENV=production`, nên `Secure` bật.

Điểm mấu chốt: trình duyệt coi `localhost` là **secure-context**, nên **chấp nhận cookie `Secure`
kể cả qua http**. Vì thế demo chạy ở `http://localhost:8080` hoạt động đúng mà **không phải sửa một
dòng mã nào**. Ranh giới "chỉ config" ở §1.2 được giữ.

Truy cập qua địa chỉ IP LAN nằm ngoài phạm vi bản này. Một IP LAN qua http không phải secure-context,
nên trình duyệt sẽ bỏ cookie `Secure` và luồng refresh vỡ. Muốn hỗ trợ IP LAN thì phải env-gate cờ
`secure` trong `refresh-cookie.ts`. Đó là thay đổi mã backend, nên để lại làm việc sau nếu thật sự
cần, không đưa vào demo này.

### 8.3. Quyết định 4 — Swagger giữ mở, có ghi chú

Swagger ở `/api/v1/docs` giữ mở trong image prod để người chạy thử khám phá API. `main.ts` và README
ghi rõ đây là **lựa chọn demo có chủ đích**, không phải mặc định an toàn cho prod (đúng docs/06 §11).
Không đổi mã. Chuẩn production là gate sau một cờ môi trường; việc nói rõ điều đó chính là tín hiệu
hiểu cái gì không nên hở ở prod.

### 8.4. Throttle giữ nguyên ở prod

`THROTTLE_DISABLED` chỉ dành cho e2e. Bản compose prod **không đặt** biến này, nên throttle auth chạy
bình thường. Đây là bất biến đã ghi: tắt throttle ngoài e2e là lỗ hổng.

---

## 9. .dockerignore — hai context

Mỗi context build có một `.dockerignore` để build context nhỏ và không lọt bí mật vào image. Loại
trừ: `node_modules`, `dist`, `.git`, `.env`, `coverage`, và `web/node_modules`. Đặc biệt loại `.env`
để bí mật không bị copy vào image do nhầm.

---

## 10. Chia slice và thứ tự build

Hai slice, mỗi slice là một session riêng theo đúng chuỗi plan → execute → verify (docker) → commit.
Commit theo Conventional Commits tiếng Anh.

### Slice 1 — Image backend cộng compose(pg, backend) cộng entrypoint

- Viết `Dockerfile` (multi-stage), `.dockerignore`, `scripts/docker-entrypoint.sh`,
  `scripts/seed-if-empty.ts`.
- Mở rộng `docker-compose.yml` thêm service `backend` nối `postgres` qua healthcheck, env từ file,
  `NODE_ENV=production`.
- Verify: `docker compose up postgres backend` từ sạch. Entrypoint migrate cộng seed. Gọi
  `GET /api/v1/health` trả 200. Login một seed user bằng curl trả token cộng `Set-Cookie`.

### Slice 2 — Image frontend Nginx cộng reverse-proxy cộng README cộng e2e đầy đủ

- Viết `web/Dockerfile`, `web/nginx.conf`, `web/.dockerignore`.
- Thêm service `web` publish `8080:80`, `depends_on: backend`.
- Viết lại `README.md` (DOC-02 cộng DOC-03).
- Verify: luồng end-to-end đầy đủ (xem §11).

---

## 11. Verification — nghiệm thu bằng Docker

Chạy sau Slice 2, chứng minh cả ba NFR-DEPLOY.

1. Từ checkout sạch: `docker compose up -d --build`. Cả ba container khoẻ.
2. Mở `http://localhost:8080`. SPA load. Login seed user (`admin@demo.local` cộng `Password123!`).
   Đi một luồng chính: list task, tạo và giao task, filter overdue, xem stats hoặc dashboard.
3. Swagger truy cập được ở `http://localhost:8080/api/v1/docs`.
4. **Bền vững (NFR-DEPLOY-02):** tạo hoặc sửa một task. Chạy `docker compose restart backend` (hoặc
   `down` không kèm `-v` rồi `up`). Thay đổi còn nguyên. Seed KHÔNG chạy lại.
5. **Seed idempotent (NFR-DEPLOY-03):** `docker compose down -v` rồi `up -d`. Volume mới nên rỗng.
   Entrypoint reseed sạch. Ứng dụng dùng lại được.
6. Xác nhận `THROTTLE_DISABLED` không được đặt trong backend đang chạy. Luồng cookie refresh chạy
   được qua `http://localhost:8080` (cookie `Secure` được chấp nhận trong secure-context localhost).

---

## 12. Truy vết — quyết định về file

| Quyết định | Yêu cầu | File hiện thực |
|---|---|---|
| Nginx front-door | NFR-DEPLOY-01, same-origin | `web/Dockerfile`, `web/nginx.conf`, `docker-compose.yml` |
| migrate deploy cộng seed-if-empty | NFR-DEPLOY-02, 03 | `scripts/docker-entrypoint.sh`, `scripts/seed-if-empty.ts` |
| Cookie qua localhost | docs/06 §6.4 | Không đổi mã; `docker-compose.yml` đặt `NODE_ENV=production` |
| Swagger giữ mở | DOC-01, docs/06 §11 | Không đổi mã; ghi chú trong `README.md` |
| Base image multi-stage | NFR-DEPLOY-01 | `Dockerfile` |
| Cổng 8080, một compose | NFR-DEPLOY-01 | `docker-compose.yml` |
| README một lệnh cộng tech doc | DOC-02, DOC-03 | `README.md` |

---

## 13. Bất biến phải giữ

- Không sửa hợp đồng đông cứng `docs/00–06` và không đổi luật nghiệp vụ. Chỉ thêm config triển khai.
- Prisma dùng `migrate deploy` khi deploy. Không `reset`, không `db push`. Pin v6.19. Volume Postgres
  mount `/var/lib/postgresql`.
- Same-origin ở prod để cookie `Path=/api/v1/auth` chạy và tránh CORS.
- `THROTTLE_DISABLED` chỉ cho e2e, không bật ở prod. Bí mật qua env, không commit `.env` thật.
