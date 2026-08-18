# Giai đoạn 11 — Kế hoạch mở rộng theo chiều ngang (Redis)

> Hệ thống quản lý công việc nội bộ (Internal Task Management System)
> Tài liệu này là mini-design cho **lớp hạ tầng chia sẻ trạng thái giữa nhiều instance backend**.
> Nó KHÔNG định nghĩa lại luật nghiệp vụ và KHÔNG sửa hợp đồng đã đông cứng (`docs/00–06`).
> Cũng như Giai đoạn 10, đây là lớp đặt lên trên một hệ thống đã hoàn chỉnh, và cũng như các tài
> liệu trước, nó ghi rõ lý do và đánh đổi cho mỗi quyết định.
> Giai đoạn này chia làm bốn slice. Slice 1 đã ship và được mô tả đầy đủ ở mục 3, slice 2 ở mục 6 và
> 7. Slice 3 với 4 còn ở mức phác thảo (mục 8), sẽ có mini-design riêng khi tới lượt build.

---

## Bảng thuật ngữ

| Thuật ngữ | Nghĩa ngắn |
|---|---|
| horizontal scaling (mở rộng ngang) | Tăng năng lực bằng cách chạy thêm instance của cùng một service, thay vì cấp thêm CPU và RAM cho một instance. |
| replica (bản sao) | Một trong nhiều container backend chạy cùng image, cùng cấu hình, đứng sau reverse-proxy. |
| stateless (không giữ trạng thái) | Instance không giữ dữ liệu riêng giữa các request. Mọi trạng thái dùng chung nằm ở Postgres hoặc Redis, nên request rơi vào replica nào cũng cho kết quả như nhau. |
| throttle (siết nhịp) | Giới hạn số request mỗi khoảng thời gian cho một khoá, ở đây là địa chỉ IP client. Vượt ngưỡng thì trả 429. |
| store (kho đếm) | Nơi `@nestjs/throttler` giữ bộ đếm. Mặc định là bộ nhớ tiến trình; slice này đổi sang Redis. |
| seam (đường cắt để sẵn) | Điểm trong mã đã chừa sẵn để thay một cách hiện thực khác mà không phải mổ lại xung quanh. |
| resolver (bộ phân giải tên) | Cấu hình chỉ cho Nginx hỏi DNS ở đâu và bao lâu hỏi lại. Quyết định Nginx thấy được bao nhiêu replica. |
| round-robin (chia lượt vòng) | Cách chia tải xoay vòng đều qua từng địa chỉ đích. |
| control run (lượt đối chứng) | Lượt đo chạy với đúng một biến bị tắt, để chứng minh kết quả đến từ biến đó chứ không từ thứ khác. |
| queue (hàng đợi) | Danh sách việc cần làm nằm ngoài tiến trình. Bên này ghi vào, bên kia lấy ra làm sau. |
| job (việc) | Một đơn vị việc trong hàng đợi, gồm tên và dữ liệu kèm theo. |
| producer (bên ghi) | Phía đẩy job vào hàng đợi. Ở đây là đường request. |
| worker (bên chạy) | Phía lấy job ra và thực thi. Ở đây là chính tiến trình backend, nhưng ngoài đường request. |
| repeatable job (job lặp lịch) | Job do một lịch trong Redis tự sinh ra theo chu kỳ, thay vì do ai đó gọi. |
| digest (thư tổng hợp) | Một email gộp nhiều mục thay vì mỗi mục một email. |
| decorator (lớp bọc) | Một hiện thực của interface, bọc quanh một hiện thực khác để thêm hành vi mà không sửa nó. |

---

## 1. Mục tiêu và phạm vi

Giai đoạn 11 làm cho backend **chạy được nhiều instance song song mà hành vi không đổi**. Không có
tính năng nghiệp vụ mới, không thêm endpoint, không đổi envelope lỗi.

Backend vốn đã gần stateless: JWT không có session phía server, refresh token nằm ở Postgres, dữ
liệu nghiệp vụ nằm ở Postgres. Còn đúng **một** mẩu trạng thái nằm trong RAM tiến trình, và đó là
bộ đếm throttle. Slice 1 dọn nốt mẩu đó.

### 1.1. Ranh giới — hạ tầng, không chạm hợp đồng

| Giữ nguyên tuyệt đối | Ghi ở |
|---|---|
| Giới hạn login 5 lần mỗi phút, refresh 10 lần mỗi phút | `docs/06 §6.4`, `src/auth/auth.controller.ts` |
| Status 429 và mã lỗi `RATE_LIMITED`, kèm header `Retry-After` | `docs/06 §11` registry lỗi |
| Chỉ siết `/auth/login` và `/auth/refresh`, không siết toàn cục | `docs/04 §6.4` |
| Envelope lỗi và mọi projection | `docs/06` |

`docs/04` chỉ nói endpoint auth **nên có** throttle cơ bản. Nó không nói bộ đếm nằm ở đâu. Vì vậy
đổi chỗ đặt bộ đếm là quyết định hạ tầng thuần tuý, nằm ngoài phạm vi hợp đồng đông cứng. Không sửa
một dòng nào trong `docs/00–06`.

---

## 2. Vấn đề: bộ đếm trong RAM loãng theo số replica

`ThrottlerModule` không nhận `storage` thì `@nestjs/throttler` tự dựng `ThrottlerStorageService`,
tức bộ đếm nằm trong RAM của **một** tiến trình. Chạy một instance thì đúng. Chạy N instance sau
reverse-proxy thì mỗi instance đếm riêng một bộ, nên giới hạn thực tế nở thành 5 nhân N lần mỗi
phút.

Hệ quả không chỉ là con số bị nới. Nó còn **thất thường**: cùng một IP có thể bị chặn ở request này
rồi lại lọt ở request ngay sau, tuỳ request đó rơi vào replica nào. Với một cơ chế chống dò mật
khẩu thì cả hai đều là hỏng.

> Đây là loại lỗi chỉ lộ ra khi scale. Ở một instance nó ẩn hoàn toàn, và test tự động cũng không
> bắt được vì lưới e2e chạy đúng một tiến trình.

---

## 3. Slice 1 — Redis làm store cho throttle

### 3.1. Quyết định đã chốt

| # | Quyết định | Chọn | Lý do gọn |
|---|---|---|---|
| 1 | Thư viện adapter | `@nest-lab/throttler-storage-redis` | Của chính maintainer `@nestjs/throttler`; peer khớp v6 và Nest 11 |
| 2 | Client Redis | `ioredis` ghim `^5` | Adapter viết và kiểm trên v5; `latest` là v6 chưa ai kiểm với adapter (xem §5.1) |
| 3 | Cách bật | Theo sự có mặt của biến `REDIS_URL` | Dev và test không cần Redis; compose bật giùm (xem §3.2) |
| 4 | Persistence của Redis | Tắt hẳn | Bộ đếm hết hạn sau 60 giây, lưu bền không có ý nghĩa (xem §3.4) |
| 5 | Số replica mặc định | Một | Demo một lệnh giữ nguyên độ nhẹ; scale là cờ khi cần (xem §3.4) |
| 6 | Phân giải tên ở Nginx | Resolver Docker cộng biến trong `proxy_pass` | Không có nó thì `--scale` vô nghĩa (xem §4) |

### 3.2. Seam chọn store

Toàn bộ quyết định gói trong một hàm thuần ở `src/auth/throttler-storage.ts`:

```ts
export function resolveThrottlerStorage(
  redisUrl?: string,
): ThrottlerStorage | undefined {
  if (!redisUrl) return undefined;
  return new ThrottlerStorageRedisService(redisUrl, { lazyConnect: true });
}
```

Trả `undefined` là hợp lệ chứ không phải thiếu sót. `ThrottlerStorageProvider` của thư viện dựng
`ThrottlerStorageService` in-memory khi `options.storage` rỗng. Nhờ vậy một hàm nhỏ phủ được cả ba
môi trường:

| Môi trường | `REDIS_URL` | Store | Hệ quả |
|---|---|---|---|
| `npm run start:dev` | không đặt | in-memory | Máy dev không phải cài Redis |
| `npm test`, `npm run test:e2e` | không đặt | in-memory | Lưới test chạy y như trước, không mở socket |
| `docker compose` | `redis://redis:6379` | Redis | Mọi replica đếm chung một bộ |

Hai chi tiết nhỏ nhưng cố ý:

- **Truyền URL dạng chuỗi, không tự dựng instance ioredis rồi truyền vào.** Adapter chỉ đặt cờ
  `disconnectRequired` cho client do chính nó tạo. Đi đường chuỗi thì `onModuleDestroy` của adapter
  đóng kết nối giùm, nên app tắt sạch và Jest không kẹt handle.
- **`lazyConnect`** hoãn mở socket tới lệnh đầu tiên. Bootstrap không phụ thuộc Redis đã sẵn sàng
  hay chưa, và unit test dựng được store thật mà không cần một Redis đang chạy.

### 3.3. Đấu dây vào module

`src/auth/auth.module.ts` đổi `ThrottlerModule.forRoot` thành `forRootAsync`, đúng một lý do là để
bơm được `storage` đọc từ `ConfigService`. Mảng `throttlers` và `skipIf` giữ nguyên từng ký tự.

Khoá mà thư viện sinh ra vốn đã ổn định xuyên tiến trình, nên không phải cấu hình thêm gì:

```
generateKey = sha256("AuthController-login-default-" + tracker)
tracker     = req.ip
```

Tên class và tên handler nằm trong bundle nên hai replica sinh ra **đúng cùng một khoá**. Còn
`req.ip` là IP thật của client nhờ hai thứ đã có sẵn từ Giai đoạn 7 và 10: `trust proxy` bật ở
`src/app-config.ts` và Nginx chuyển tiếp `X-Forwarded-For`. Kịch bản Lua của adapter gộp `INCR`,
`PEXPIRE` và khoá chặn vào một `EVAL` duy nhất, nên hai replica tăng đếm đồng thời không tranh chấp.

### 3.4. Đổi ở `docker-compose.yml`

Thêm service `redis` dùng `redis:8-alpine`, tắt cả `--save` lẫn `--appendonly`, không gắn volume và
không publish cổng ra host. Lý do: bộ đếm là trạng thái phù du, hết hạn trong 60 giây. Lưu bền nó
chỉ tốn đĩa mà không cứu được gì, còn mở cổng ra host thì mở rộng bề mặt tấn công vô ích.

Ở service `backend` có ba thay đổi:

| Thay đổi | Lý do |
|---|---|
| Thêm `REDIS_URL: ${REDIS_URL:-redis://redis:6379}` | Bật đường Redis cho bản triển khai, theo đúng lối `${VAR:-default}` của các biến khác |
| Thêm `depends_on: redis: service_healthy` | Redis sẵn sàng trước khi backend nhận request đầu |
| **Bỏ `container_name`** | Compose từ chối `--scale` lớn hơn 1 khi container bị đặt tên cứng |

Bỏ `container_name` là giá phải trả để `--scale backend=N` chạy được, và cái giá này rẻ. Container
đổi tên thành `itms-backend-1` cho tới `-N`. Đã rà toàn repo, không file nào tham chiếu tên cũ.

Compose vẫn mặc định **một** replica. Người chấm chạy `docker compose up -d --build` vẫn được đúng
trải nghiệm nhẹ như Giai đoạn 10. Nhiều replica là một cờ thêm vào khi muốn kiểm chứng.

---

## 4. Phát hiện phụ: Nginx ghim hết traffic vào một replica

Đây là lỗi tìm ra **trong lúc** kiểm chứng slice này, và nó nghiêm trọng hơn cả lỗi đang đi sửa.

Lượt đối chứng đầu tiên cho kết quả sai một cách đáng ngờ: chạy hai replica với store in-memory mà
vẫn chặn đúng ở request thứ 6, hệt như một replica. Nếu tải thật sự chia đôi thì phải tới khoảng
request thứ 10 mới chặn.

Đo bằng một container Nginx tách riêng, cấu hình `log_format` chỉ in `$upstream_addr` để biết chính
xác replica nào phục vụ từng request:

| Dạng `proxy_pass` | 8 request đi đâu |
|---|---|
| `http://backend:3000` — tên host viết thẳng | **8 trên 8** vào `172.22.0.4` |
| `$b$request_uri` cộng `resolver` | 3 vào `.4`, 5 vào `.6` |

Tên host viết thẳng thì Nginx phân giải **một lần lúc khởi động** rồi giữ nguyên kết quả đó suốt
vòng đời tiến trình. Điều đáng nói là Nginx **có biết** địa chỉ thứ hai: tắt đúng replica đang bị
ghim thì 4 trên 4 request tiếp theo vẫn trả 200, tức nó chuyển sang container còn lại. Nghĩa là địa
chỉ thứ hai nằm trong nhóm nhưng chỉ đóng vai dự phòng khi cái đầu chết, chứ không được chia phần
traffic.

> Một giả thuyết ban đầu đã bị chính phép đo bác bỏ, ghi lại để không ai đi lại đường cụt: **không
> phải** do `getaddrinfo` của musl trả về thiếu địa chỉ. Gọi thẳng `socket.getaddrinfo` trong cả
> image Alpine (musl) lẫn Debian (glibc) đều ra đủ hai địa chỉ. Cái làm người ta lầm là `getent
> hosts` chỉ in dòng đầu tiên, đó là thói quen hiển thị của `getent` chứ không phải giới hạn của
> resolver. Tài liệu Nginx cũng nói một tên phân giải ra nhiều địa chỉ thì dùng round-robin, nên
> hành vi đo được ở đây khác với kỳ vọng từ tài liệu. Lý do bên trong Nginx chưa truy tới cùng;
> phần chắc chắn là **số đo**, và số đo đủ để kết luận về mặt vận hành.

Kết luận vận hành: trước slice này, `--scale backend=N` chỉ tạo ra N container còn gần như toàn bộ
request đi vào đúng một cái. Khả dụng thì vẫn có, vì còn đường dự phòng. Nhưng **chia tải thì
không**, và mọi phép đo dựa trên "đã chạy N replica" đều vô nghĩa. Bản triển khai Giai đoạn 10 không
mở rộng ngang được như tưởng.

Cách sửa ở `web/nginx.conf` gồm hai phần đi liền nhau:

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
...
set $itms_backend http://backend:3000;
proxy_pass $itms_backend$request_uri;
```

- `resolver 127.0.0.11` trỏ thẳng vào DNS nội bộ của Docker. `valid=10s` khiến Nginx hỏi lại định
  kỳ, nên replica thêm vào lúc đang chạy cũng được nhận traffic.
- **Dùng biến trong `proxy_pass` mới là mấu chốt.** Chỉ khi đích chứa biến thì Nginx mới hoãn phân
  giải sang lúc chạy và mới dùng tới `resolver`. Viết thẳng tên host là quay lại phân giải một lần
  lúc khởi động.
- `$request_uri` là URI thô của client kèm query string, nên ba điều bắt buộc của `docs/10 §6` vẫn
  nguyên: không viết lại đường dẫn, vẫn chuyển tiếp `X-Forwarded-*`, vẫn có SPA fallback.

Đổi lại còn một tác dụng phụ tốt: Nginx không còn phải phân giải được `backend` lúc khởi động nữa,
nên thứ tự lên của các container bớt mong manh.

---

## 5. Kiểm chứng đã chạy

Cổng cơ học trước tiên: `npm run lint`, `npm run build`, `npm test` (49 unit, tăng 4 case của
`throttler-storage.spec.ts`), `npm run test:e2e` (42, không đổi).

Phần đa instance chạy trên stack thật, qua Nginx ở cổng 8080:

```bash
docker compose up -d --build --scale backend=2
# 10 lần POST /api/v1/auth/login với mật khẩu sai, giới hạn là 5 mỗi phút
```

| Lượt | Store | Kết quả 10 request | Đọc kết quả |
|---|---|---|---|
| Đối chứng | in-memory | `401 401 401 401 401 401 401 401 429 401` | Giới hạn nở thành khoảng 10 mỗi phút, và chặn thất thường: chặn ở request 9 rồi lọt lại ở request 10 |
| Thật | Redis | `401 401 401 401 401 429 429 429 429 429` | Đúng 5 mỗi phút, chặn rồi là chặn dứt khoát |

Lượt đối chứng đóng hai vai cùng lúc. Nó cho thấy store in-memory hỏng ra sao, và nó **chứng minh
Nginx thật sự chia tải cho cả hai replica**. Nếu traffic vẫn dồn vào một container thì lượt đối
chứng cũng phải chặn ở request thứ 6.

Bằng chứng phía Redis, lấy ngay sau loạt request:

```
client list | grep -c ioredis   → 2                     hai replica cùng nối vào một store
--scan                          → {sha256...:default}:hits và :blocked   đúng một cặp khoá dùng chung
get  ...:hits                   → 7                     đếm cộng dồn qua cả hai replica
pttl ...:hits                   → 58776 ms              cửa sổ 60 giây đang chạy
```

Hợp đồng không suy suyển: request thứ 6 trả `429` kèm `Retry-After: 60`, thân lỗi vẫn đúng envelope
với `code` là `RATE_LIMITED`.

Cuối cùng là rà lại các điều bắt buộc của `docs/10` sau khi động vào Nginx, tất cả đều xanh: đăng
nhập thật qua proxy được, cookie refresh vẫn ở `Path=/api/v1/auth`, `/auth/refresh` xoay vòng trả
200, query string giữ nguyên (`?page=2&limit=3` về đúng `meta.page` là 2 và `meta.limit` là 3),
`/api/v1/docs` mở được, và SPA fallback trả `index.html` cho `/tasks`.

### 5.1. Đánh đổi và rủi ro đã lường

- **Redis chết lúc đang chạy thì login trả 500** thay vì 401 hoặc 429. Lệnh `increment` bị reject và
  guard không nuốt lỗi. Đây là hướng fail-closed, chấp nhận được ở phạm vi demo vì compose đã có
  healthcheck cộng `depends_on: service_healthy`. Muốn đi xa hơn thì bọc store bằng một lớp fallback
  về in-memory, nhưng như vậy lại lặng lẽ quay về đúng cái lỗi vừa sửa, nên không làm.
- **`ioredis` ghim `^5`.** Peer của adapter ghi `>=5.0.0` nên `npm i ioredis` sẽ lấy v6, trong khi
  adapter kiểm tra `instanceof Redis | Cluster` theo API v5. Ghim `^5.11.1` cho tới khi adapter nói
  rõ là đã hỗ trợ v6.
- **429 vẫn không có test tự động.** Giữ đúng lệ đã ghi ở `docs/08 §6`: trạng thái throttle cộng dồn
  theo thời gian nên nhét vào lưới e2e sẽ gây flaky. Phần §5 ở trên chính là bản smoke tay mở rộng
  cho nhiều instance của mục đó.

---

## 6. Slice 2 — BullMQ đẩy email ra khỏi đường request

### 6.1. Vấn đề: một request ghi task phải chờ SMTP

`docs/07.A` mục 5 chốt cơ chế thông báo là **await rồi nuốt lỗi**, và ghi thẳng đánh đổi của nó:
"request phải chờ SMTP trả về. Với volume nội bộ thì chấp nhận được. Queue hay outbox bền hơn nhưng
thêm hạ tầng, vượt phạm vi tính năng bonus."

Slice 1 vừa thêm service `redis` vào compose, nên vế "thêm hạ tầng" không còn đúng nữa. Cái giá thì
đo được: `POST /tasks` giao việc cho người khác mất **khoảng 2,75 giây**, gần như toàn bộ là vòng
đi về tới SMTP của provider. Người dùng chờ ngần ấy để nhận về một task đã ghi xong từ lâu.

Slice này làm hai việc. Một là đẩy việc gửi sang một worker chạy ngoài đường request. Hai là thêm
một job định kỳ quét task quá hạn theo nhóm rồi gửi digest cho leader.

### 6.2. Quyết định đã chốt

| # | Quyết định | Chọn | Lý do gọn |
|---|---|---|---|
| 1 | Thư viện hàng đợi | `@nestjs/bullmq` cộng `bullmq` v6 | BullMQ đứng trên chính Redis đã có; binding Nest là của cùng tổ chức |
| 2 | Chỗ đặt lớp queue | Sau seam `Notifier`, dạng decorator | Use-case không phải biết có queue hay không (mục 6.3) |
| 3 | Cách bật | Theo sự có mặt của `REDIS_URL`, quyết ở metadata module | BullMQ không có bản in-memory, và không hoãn được sang lúc chạy (mục 6.6) |
| 4 | Lịch chạy định kỳ | Repeatable job của BullMQ, **không** `@nestjs/schedule` | `@Cron` bắn trên mọi replica, leader nhận N bản trùng (mục 6.5) |
| 5 | Đường quét task quá hạn | `TaskQueryPort.list` với `overdue: true` | Dùng chung đúng predicate với cờ `overdue` và với Stats (mục 6.4) |
| 6 | Lỗi gửi ở worker | Ném ra cho BullMQ retry, không nuốt | Nuốt thì `attempts` chỉ là trang trí (mục 6.7) |

### 6.3. Queue nằm sau seam, không nằm trước

Điểm móc đã có sẵn từ `docs/07.A` là port `Notifier`. Slice này gắn vào đúng chỗ đó, nên
`CreateTask`, `ReassignTask` và `Users.deactivate` **không sửa một dòng nào**. Chúng vẫn inject
`NOTIFIER` và gọi đúng các method cũ. Thứ đổi là cái nằm sau token đó.

```
CreateTask ──inject NOTIFIER──> QueuedNotifier ──queue.add()──> Redis
                                                                  │
                                            worker (một replica)  ▼
                                   NotificationsProcessor ──> DIRECT_NOTIFIER ──> SMTP
```

Có hai token thay vì một, và lý do rất cụ thể. `NOTIFIER` là cái use-case nhìn thấy.
`DIRECT_NOTIFIER` là adapter gửi thật. Nếu worker cũng gọi `NOTIFIER` thì mỗi job xử lý xong lại ghi
thêm một job y hệt, tức một vòng lặp vô tận. Tách token cắt đứt vòng đó bằng cấu trúc chứ không bằng
kỷ luật.

Một provider phủ được cả hai thế giới nhờ cờ `rethrow` bám theo việc queue có bật hay không:

| Queue | `NOTIFIER` là | Người tiêu thụ `DIRECT_NOTIFIER` | `rethrow` |
|---|---|---|---|
| tắt | chính `DIRECT_NOTIFIER` | use-case, đang trong đường request | `false`, nuốt lỗi như trước |
| bật | `QueuedNotifier` | worker, đã ngoài đường request | `true`, ném cho BullMQ retry |

Payload của job chỉ mang ID và chuỗi ISO, không mang email. Đây là kỷ luật "event mang ID" của
`docs/07.A` mục 3, và hệ quả phụ là không địa chỉ email nào nằm trong Redis.

### 6.4. Digest quá hạn: hook thứ tư trên port

Port `Notifier` lên bốn method. Ba method cũ phát từ use-case; `notifyOverdueDigest` phát từ lịch
định kỳ nằm ở infrastructure.

Đặt digest sau port thay vì dựng một service riêng là để **dùng lại ba thứ đã có**: cờ
`MAIL_ENABLED` chọn adapter, bất biến nuốt lỗi, và lớp bọc queue. Một service riêng phải chép lại cả
ba. Đây cũng đúng nước đi mà `docs/07.A` đã làm khi thêm `notifyAssigned`, kèm đúng nghĩa vụ giấy tờ
là đồng bộ `src/tasks/CLAUDE.md`.

Việc quét đi qua `TaskQueryPort.list`, **không** qua repository:

```ts
this.query.list({ scopeTeamId: teamId, now, overdue: true, skip: 0, take: 10 });
```

`overduePredicate` vẫn là hàm private của `prisma-task.repository.ts` và phải giữ nguyên như vậy.
Đường `list` với `overdue: true` đã dùng đúng predicate đó qua `buildListWhere`, nên digest không thể
lệch định nghĩa OVERDUE với cờ `overdue` của `GET /tasks` hay với `byAssignee.overdue` của Stats. Nếu
export predicate ra để digest gọi thẳng thì có ngay hai đường vào cùng một luật, và hai đường thì
sớm muộn cũng lệch.

`total` trả về là số quá hạn đầy đủ, còn `items` chỉ là mười dòng đầu để dựng thân thư; phần dư gộp
thành một dòng "và N task khác" chứ không cắt cụt trong im lặng.

Hai trường hợp cố ý **không** gửi. Nhóm không có leader đang hoạt động thì không có người nhận, chỉ
ghi log. Nhóm sạch nợ (`total` bằng 0) thì im lặng, vì một thư báo "không có gì quá hạn" gửi mỗi
sáng là cách nhanh nhất để người ta lọc bỏ toàn bộ kênh thông báo này.

Phạm vi không bị nới: `scopeTeamId` truyền vào là nhóm của chính leader nhận thư, nên leader chỉ
nhận đúng những task họ vốn thấy ở `GET /tasks`.

### 6.5. Lịch chạy một lần dù có bao nhiêu replica

Đây là chỗ dễ sai nhất của slice, và nó sai theo kiểu im lặng.

`@Cron` của `@nestjs/schedule` sống trong tiến trình. Chạy N replica thì tới giờ có N lần bắn, và
leader nhận N bản digest giống hệt nhau. Muốn dùng nó thì phải tự viết thêm một khoá phân tán, tức
tự dựng lại đúng thứ mà Redis đã có sẵn. Vì vậy slice này **không thêm `@nestjs/schedule`**.

Repeatable job của BullMQ đặt lịch ở Redis dưới một id. Mọi replica cùng `upsert` một id thì kết quả
vẫn là một lịch, mỗi lần đến hạn sinh một job, và đúng một worker giành được job đó.

```ts
await queue.upsertJobScheduler(
  'overdue-digest',
  { pattern: config.get('OVERDUE_DIGEST_CRON') ?? '0 1 * * *', tz: 'UTC' },
  { name: 'overdue-digest-sweep', opts: { removeOnComplete: { count: 50 } } },
);
```

Mặc định là 01:00 UTC hằng ngày, tức 08:00 giờ Việt Nam, ghi đè bằng biến `OVERDUE_DIGEST_CRON`. Múi
giờ ghi tường minh là UTC vì hợp đồng dùng ISO-8601 UTC ở mọi nơi, và giờ gửi thư không nên phụ
thuộc múi giờ của container.

Lượt quét chốt **một** mốc `now` từ `Clock` rồi phát cho mọi nhóm, đúng cổng cơ học 3. Mốc đó đi qua
hàng đợi dưới dạng chuỗi ISO-8601 trong payload job, nên "mọi nhóm dùng chung một mốc" là thứ soi
được bằng mắt khi đọc job chứ không phải chỉ tin vào code.

Redis chết lúc bootstrap thì bộ đăng ký lịch ném lỗi và app không lên. Cố ý, cùng triết lý fail-fast
của `createSmtpTransport` ở `docs/07.A` mục 7: lên được mà lịch câm là kiểu hỏng không ai phát hiện ra.

### 6.6. Không có Redis thì sao

Slice 1 hoãn được quyết định sang lúc chạy, vì `resolveThrottlerStorage` trả `undefined` là hợp lệ và
thư viện tự dựng bản in-memory. BullMQ không cho làm vậy. Nó không có bản in-memory, và tệ hơn:
`Queue` mặc định bật `enableOfflineQueue` cùng `maxRetriesPerRequest: null`, nên `queue.add()` lúc
vắng Redis sẽ **treo vĩnh viễn** chứ không reject. Đăng ký vô điều kiện là làm treo cả
`npm run start:dev` lẫn lưới e2e ngay lúc khởi tạo.

Vì vậy quyết định phải nằm ở **metadata module**, không ở runtime. `tasks.module.ts` đọc `REDIS_URL`
rồi spread vào `imports` và `providers` hai mảng có thể rỗng.

| Môi trường | `REDIS_URL` | `NOTIFIER` | Digest |
|---|---|---|---|
| `npm run start:dev` | không đặt | adapter trực tiếp | không chạy |
| `npm test` | không dựng app | không liên quan | không chạy |
| `npm run test:e2e` | ép chuỗi rỗng | adapter trực tiếp, tức `NoopNotifier` | không chạy |
| `docker compose` | `redis://redis:6379` | `QueuedNotifier` | chạy |

Đọc env ở thời điểm dựng metadata kéo theo một chi tiết dễ trượt. Thời điểm đó nằm **trước** khi
`ConfigModule.forRoot()` trong `app.module.ts` nạp `.env`, vì require chạy theo thứ tự import và
decorator của module con áp trước module cha. Không xử lý thì `REDIS_URL` đặt trong `.env` bật được
throttle store của slice 1 nhưng lại im lặng không bật queue, tức một biến mà hai cơ chế hiểu khác
nhau. Cách xử lý là nạp `dotenv/config` ngay dòng đầu `src/main.ts`.

Lưới e2e không dựa vào thứ tự đó. `test/setup/env.ts` **gán** `REDIS_URL` thành chuỗi rỗng. Chi tiết
"gán chứ không `delete`" là bắt buộc, xem mục 7.4.

### 6.7. Đánh đổi và rủi ro đã lường

- **Redis chết lúc đang chạy thì thông báo mất, kèm log lỗi.** `QueuedNotifier` bọc `queue.add` trong
  try/catch, vì nếu để `add` reject thì `CreateTask` vỡ, tức tái tạo đúng cái mà bất biến
  `docs/07.A` mục 5 cấm. Cố ý **không** có đường lặng lẽ rơi về gửi đồng bộ: như vậy là dựng lại
  chính đường request-chậm mà slice này đang gỡ đi, và lặp lại lỗi tư duy mà slice 1 đã từ chối.
- **Bất biến "email không vỡ task-write" đổi chỗ đứng, không đổi nội dung.** Trước slice này, chỗ bảo
  vệ nó là `EmailNotifier`. Giờ trên đường có queue, chỗ bảo vệ là `QueuedNotifier` ở phía ghi job,
  còn adapter ở phía worker cố tình ném. Câu chữ tuyệt đối "`notify*` không bao giờ reject" trong
  `docs/07.A` mục 5 vì vậy phải đọc kèm mục này.
- **Retry chỉ áp cho lỗi gửi, không áp cho lỗi ghi job.** Job hỏng thử lại ba lần với backoff hàm mũ
  rồi nằm lại `failed` để soi. Còn nếu Redis chết ngay lúc ghi thì không có job nào tồn tại để mà
  thử lại; đó là đánh đổi ở gạch đầu dòng đầu.
- **Digest không có test tự động.** Giữ đúng lệ đã ghi ở `docs/08` mục 6 cho 429: thứ phụ thuộc lịch
  và trạng thái cộng dồn thì nhét vào lưới e2e sẽ gây flaky. Phần logic thuần có test unit; phần
  chạy thật kiểm bằng smoke tay ở mục 7.
- **`bullmq` v6 cộng `ioredis` v5.** Peer của `@nestjs/bullmq` v11 nhận `bullmq` từ v3 tới v6, và
  `ioredis` vẫn dùng chung đúng bản đã ghim ở slice 1 nên không phát sinh bản thứ hai.

---

## 7. Kiểm chứng đã chạy (slice 2)

Cổng cơ học trước tiên: `npm run lint`, `npm run build`, `npm test` (**73**, tăng từ 49),
`npm run test:e2e` (**42**, không đổi). Cả hai lưới test chạy với Redis không tham gia.

### 7.1. Đường request không còn chờ SMTP

Hai lượt trên cùng một stack, cùng `MAIL_ENABLED=true` trỏ provider thật, chỉ khác đúng một biến là
`REDIS_URL`. Leader tạo task giao cho member, đo `time_total` của `POST /tasks` qua Nginx ở cổng 8080.

| Lượt | `REDIS_URL` | Đường gửi | `time_total` (3 lần) |
|---|---|---|---|
| Đối chứng | rỗng | đồng bộ trong request | 2,922 · 2,750 · 2,712 giây |
| Slice 2 | `redis://redis:6379` | ghi job rồi trả | 0,016 · 0,011 · 0,011 giây |

Khoảng 2,75 giây xuống khoảng 11 mili giây, tức nhanh hơn chừng **250 lần**. Lượt đối chứng là phần
bắt buộc: chỉ đo lượt có queue thì con số vẫn đẹp mà không chứng minh được nó đến từ đâu.

### 7.2. Thư vẫn đi, và retry là thật

Nhanh hơn mà mất thư thì là hỏng, nên phải kiểm phía worker. Log cho thấy worker nhận job và nói
chuyện SMTP thật; provider ở chế độ sandbox chỉ nhận địa chỉ của chủ tài khoản nên trả 550 cho các
địa chỉ `@demo.local`:

```
ERROR [Notifier] Gửi email thất bại ở notifyAssigned (target=tjg8c0iq...):
  Message failed: 550 You can only send testing emails to your own email address
```

Mỗi job hỏng xuất hiện **đúng ba lần** với khoảng cách giãn dần, rồi nằm lại `failed`. Đó chính là
`attempts: 3` cộng backoff hàm mũ đang chạy, và nó chỉ chạy được vì adapter đường worker ném lỗi thay
vì nuốt. Nếu nuốt thì mỗi job xuất hiện một lần và trạng thái là `completed`.

Chiều ngược lại cũng có đối chứng trong cùng lượt đo. Leader nhóm Backend trong dữ liệu seed của máy
đo là một hộp thư thật, nên job digest gửi cho nhóm đó **completed** và thư tới thật. Leader nhóm
Frontend là `fe.lead@demo.local` nên job đó `failed` sau ba lần thử. Cùng một cơ chế, hai kết cục,
đúng theo địa chỉ người nhận.

### 7.3. Lịch chạy đúng một lần trên hai replica

Đây là phép đo trả lời câu hỏi ở mục 6.5.

```bash
OVERDUE_DIGEST_CRON="*/1 * * * *" docker compose up -d --build --scale backend=2
docker logs <mỗi replica> | grep "digest sweep"
```

| Replica | Các mốc đã chạy |
|---|---|
| `12d6fd686924` | 17:33:00 · 17:36:00 |
| `1a5b47e7c200` | 17:34:00 · 17:35:00 |

Bốn chu kỳ liên tiếp, **mỗi mốc xuất hiện đúng một lần**, và không mốc nào xuất hiện ở cả hai replica.
Đồng thời cả hai replica đều có lượt chạy, nghĩa là cả hai đều là worker hợp lệ chứ không phải một
cái nằm không. Với `@Cron` thì mỗi mốc phải xuất hiện hai lần.

Phía Redis, zset lịch có **đúng một** entry tên `overdue-digest`, và ngoài giờ chạy thì job kế tiếp
nằm ở `delayed` chờ mốc 01:00 UTC.

### 7.4. Lưới e2e không còn gửi email thật

Trong lúc kiểm chứng, một lỗi cũ đã ghi ở `docs/implementation-log.md` được đóng lại.

`test/setup/env.ts` dùng `delete process.env.MAIL_ENABLED` với ý định tắt email trong lưới e2e. Nó
làm **ngược** điều nó định làm. `ConfigModule.forRoot()` điền biến từ `.env` qua bộ lọc
`!(key in process.env)`, tức chỉ chừa ra key đã tồn tại. `delete` làm key biến mất, nên dotenv thấy
chỗ trống rồi điền `MAIL_ENABLED=true` của máy dev vào. Hệ quả: mỗi lần e2e tạo task, reassign hay
deactivate, lưới test bắn email thật qua provider.

Sửa bằng cách **gán** giá trị falsy thay vì xoá. Cùng lý do đó, `REDIS_URL` cũng gán chuỗi rỗng chứ
không `delete`, và điều này khoá luôn cả đường Redis của throttle store slice 1 trong lưới e2e.

```
delete  → MAIL_ENABLED="true"   (dotenv điền vào chỗ trống)
gán     → MAIL_ENABLED="false"  (dotenv chừa key đã có)
```

### 7.5. Hợp đồng không suy suyển

Rà lại sau khi động vào compose: đăng nhập thật qua proxy được, cookie refresh vẫn ở
`Path=/api/v1/auth`, query string giữ nguyên (`?page=2&limit=3` về đúng `meta.page` là 2 và
`meta.limit` là 3), `/api/v1/docs` mở được, SPA fallback trả `index.html` cho `/tasks`.

Riêng `GET /stats` đáng nhìn kỹ vì digest động tới khái niệm OVERDUE: trả về `total` là 6 và
`overdue` là 4, `byProgress` vẫn đúng ba key và `overdue` vẫn là sibling nằm ngoài `total`. Không
endpoint mới, không mã lỗi mới, không field mới, không migration.

---

## 8. Phác các slice còn lại

Hai slice sau đều dựa trên chính service `redis` mà slice 1 đã thêm. Mỗi slice sẽ có mini-design
riêng khi tới lượt build; phần này chỉ chốt phạm vi để không trôi.

| Slice | Nội dung | Điểm móc đã có sẵn |
|---|---|---|
| 3 | Log có cấu trúc bằng `nestjs-pino`, lấy `requestId` làm trường correlation | `src/common/request-id.middleware.ts` đã sinh và gắn sẵn `requestId` |
| 4 | Audit log chỉ ghi thêm cho deactivate, reactivate, đổi leader, đổi assignee và xoá task | Migration đi qua `/migrate`; độc lập với break-glass, không đụng vào nó |
