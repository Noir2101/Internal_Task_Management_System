# Kết quả đo hiệu năng (k6)

> **Nguồn số CANONICAL** cho mọi phát biểu về hiệu năng của hệ thống (README, CV, trao đổi kỹ thuật):
> dùng đúng những con số dưới đây, không ước lại. Số do người viết tự chạy và xác nhận.
> Công cụ tái lập nằm cùng thư mục: `seed-scale.ts` (nạp quy mô) + `tasks-list.js` (kịch bản k6).

## 1. Mục tiêu

Đối chiếu thực nghiệm hai NFR hiệu năng (docs/02 §NFR-PERF):
- **PERF-01** — vận hành đúng ở quy mô tham chiếu ~50 user / ~10 nhóm / ~5000 task.
- **PERF-02** — danh sách task (phân trang) trả về **< 1 giây** ở quy mô đó.

Trước phép đo này, hai NFR chỉ được bảo chứng bằng lý luận thiết kế (index có chủ đích + phân trang, docs/05 §7). Phép đo biến chúng thành số có bằng chứng.

## 2. Con số canonical

Endpoint đo: `GET /api/v1/tasks?page=&limit=20` (phân trang), qua front-door nginx `:8080`.

| Chỉ số `http_req_duration{name:GET /tasks}` | Đo được | Ngưỡng | Kết luận |
|---|---:|---:|:--|
| p50 (trung vị) | **9,7 ms** | — | — |
| p90 | 15,3 ms | — | — |
| **p95** | **16,5 ms** | < 1000 ms (PERF-02) | **Đạt** |
| **p99** | **20,6 ms** | < 1500 ms | **Đạt** |
| max | 35,2 ms | — | — |
| **Tỉ lệ lỗi** (`http_req_failed`) | **0,00 %** (0/4078) | < 1 % | **Đạt** |
| checks | **100 %** (12.232/12.232) | > 99 % | **Đạt** |
| Thông lượng | **~38,7 req/s** | — | — |

Biên an toàn: p95 = 16,5 ms so với ngân sách 1000 ms ⇒ **dư ~60 lần**.

## 3. Môi trường đo

- **Máy:** Intel Core i9-14900HX (24 nhân / 32 luồng), 31,7 GB RAM, Windows 11.
- **Triển khai:** Docker Compose — Postgres 18 + backend (`node:22-alpine`, `node dist/main`) + nginx front-door, đo qua **cùng một origin `:8080`** mà người dùng thật đi qua (không đo backend trực tiếp).
- **Công cụ tải:** k6 v2.1.0.
- **Dữ liệu:** 10 nhóm · 50 user (1 leader + 4 member/nhóm) · 5000 task (~500/nhóm). Đăng nhập một leader ⇒ scope nhóm **~500 task** (25 trang × 20).

## 4. Kịch bản tải (khớp lựa chọn "thực tế, có think-time")

- **Hình dạng:** ramping-VUs 0→50 trong 30s, giữ 50 VU trong 1 phút, hạ về 0 trong 15s (`tasks-list.js`).
- **Think-time:** mỗi VU nghỉ ngẫu nhiên 0,5–1,5s giữa các request (mô phỏng người dùng thật, không phải bão hoà liên tục).
- **Login một lần** trong `setup()` (né throttle auth §6.4); mọi VU dùng chung access token (TTL 15m > thời lượng test 1m45s).
- **Ngưỡng khai báo sẵn** trong script để pass/fail hiện rõ: `p(95)<1000`, `p(99)<1500`, `http_req_failed<1%`, `checks>99%`.

## 5. Tái lập (một-lệnh mỗi bước)

```bash
# 1. Stack chạy (Docker)
docker compose up -d --build

# 2. Nạp quy mô tham chiếu (GHI ĐÈ DB itms — chỉ là fixture, khôi phục được)
DATABASE_URL="postgresql://itms:itms@localhost:5433/itms?schema=public" npx tsx perf/seed-scale.ts

# 3. Đo
k6 run perf/tasks-list.js        # PowerShell: k6 đã trên PATH
# (môi trường khác PATH:  "/c/Program Files/k6/k6.exe" run perf/tasks-list.js)

# 4. Khôi phục bộ demo 8-task sau khi chụp ảnh
DATABASE_URL="postgresql://itms:itms@localhost:5433/itms?schema=public" npx tsx prisma/seed.ts
```

## 6. Lưu ý khi trích dẫn số này

- **Phân biệt `iteration_duration` với `http_req_duration`.** `iteration_duration` p95 ≈ 1,46s là *đã cộng* think-time `sleep(0.5–1.5s)` — nó phản ánh nhịp người dùng, KHÔNG phải thời gian API. Số cho PERF-02 chỉ là `http_req_duration` = **16,5 ms**.
- **Latency thấp là kỳ vọng, không phải tải bị làm nhẹ.** Query list đã scoped theo nhóm (~500 dòng) + có index (docs/05 §7) + phân trang 20 dòng; ở quy mô tham chiếu này, con số nằm gọn trong ngân sách là đúng thiết kế. Phát biểu trung thực: hệ thống **đạt PERF-02 với dư địa lớn**, không phóng đại "chịu triệu user".
- **Phạm vi phép đo:** một-endpoint đọc (đường nóng nhất theo PERF-02), tải thực tế có think-time, không phải stress-test bão hoà tìm điểm gãy. Đúng khung quy mô tham chiếu của docs/02 §PHẦN B.

## 7. Output thô (bản tự chạy)

```
  █ THRESHOLDS
    checks
    ✓ 'rate>0.99' rate=100.00%
    http_req_duration{name:GET /tasks}
    ✓ 'p(95)<1000' p(95)=16.47ms
    ✓ 'p(99)<1500' p(99)=20.58ms
    http_req_failed
    ✓ 'rate<0.01' rate=0.00%

  █ TOTAL RESULTS
    checks_total.......: 12232   115.957398/s
    checks_succeeded...: 100.00% 12232 out of 12232
    checks_failed......: 0.00%   0 out of 12232
    ✓ login 200
    ✓ status 200
    ✓ has data array
    ✓ meta.total present
    HTTP
    http_req_duration..............: avg=10.22ms min=3.66ms med=9.74ms p(90)=15.25ms p(95)=16.5ms  p(99)=20.64ms max=47.19ms
      { name:GET /tasks }..........: avg=10.21ms min=3.66ms med=9.74ms p(90)=15.25ms p(95)=16.47ms p(99)=20.58ms max=35.22ms
    http_req_failed................: 0.00%  0 out of 4078
    http_reqs......................: 4078   38.658786/s
    EXECUTION
    iteration_duration.............: avg=1.01s min=506.7ms med=1.01s p(90)=1.41s p(95)=1.46s p(99)=1.5s max=1.52s
    iterations.....................: 4077   38.649306/s
    vus_max........................: 50
    NETWORK
    data_received..................: 29 MB  277 kB/s
    data_sent......................: 1.5 MB 14 kB/s
```
