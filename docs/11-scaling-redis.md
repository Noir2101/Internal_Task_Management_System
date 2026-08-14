# Giai đoạn 11 — Kế hoạch mở rộng theo chiều ngang (Redis)

> Hệ thống quản lý công việc nội bộ (Internal Task Management System)
> Tài liệu này là mini-design cho **lớp hạ tầng chia sẻ trạng thái giữa nhiều instance backend**.
> Nó KHÔNG định nghĩa lại luật nghiệp vụ và KHÔNG sửa hợp đồng đã đông cứng (`docs/00–06`).
> Cũng như Giai đoạn 10, đây là lớp đặt lên trên một hệ thống đã hoàn chỉnh, và cũng như các tài
> liệu trước, nó ghi rõ lý do và đánh đổi cho mỗi quyết định.
> Giai đoạn này chia làm bốn slice. Slice 1 đã ship và được mô tả đầy đủ ở §3. Slice 2 tới 4 mới ở
> mức phác thảo (§6), sẽ có mini-design riêng khi tới lượt build.

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

## 6. Phác các slice còn lại

Ba slice sau đều dựa trên chính service `redis` mà slice 1 vừa thêm. Mỗi slice sẽ có mini-design
riêng khi tới lượt build; phần này chỉ chốt phạm vi để không trôi.

| Slice | Nội dung | Điểm móc đã có sẵn |
|---|---|---|
| 2 | BullMQ đẩy email ra khỏi đường request, cộng cron quét việc quá hạn gửi digest cho leader | Port `Notifier` ở `src/tasks/application/ports/notifier.port.ts`; `overduePredicate` ở repository |
| 3 | Log có cấu trúc bằng `nestjs-pino`, lấy `requestId` làm trường correlation | `src/common/request-id.middleware.ts` đã sinh và gắn sẵn `requestId` |
| 4 | Audit log chỉ ghi thêm cho deactivate, reactivate, đổi leader, đổi assignee và xoá task | Migration đi qua `/migrate`; độc lập với break-glass, không đụng vào nó |
