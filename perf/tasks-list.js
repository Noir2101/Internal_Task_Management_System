// k6 — đo GET /tasks phân trang ở quy mô tham chiếu (PERF-01/PERF-02).
// Kịch bản: 50 người dùng ảo đồng thời, có think-time (mô phỏng dùng thật), qua front-door :8080.
// Login MỘT lần trong setup() (né throttle auth); mọi VU dùng chung access token (TTL 15m > thời lượng test).
//
//   k6 run perf/tasks-list.js
//   (tuỳ chọn) k6 run -e BASE_URL=http://localhost:8080 -e EMAIL=lead0@perf.local perf/tasks-list.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8080';
const EMAIL = __ENV.EMAIL || 'lead0@perf.local';
const PASSWORD = __ENV.PASSWORD || 'Password123!';
const PAGES = 25; // scope leader ~500 task / 20 mỗi trang ⇒ ~25 trang

export const options = {
  scenarios: {
    realistic_50u: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 }, // ramp lên 50 user
        { duration: '1m', target: 50 }, // giữ tải 50 user
        { duration: '15s', target: 0 }, // ramp xuống
      ],
      gracefulStop: '5s',
    },
  },
  thresholds: {
    'http_req_duration{name:GET /tasks}': ['p(95)<1000', 'p(99)<1500'], // PERF-02: < 1s
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  const res = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  const token = res.json('accessToken');
  if (!token) throw new Error(`login failed: ${res.status} ${res.body}`);
  return { token };
}

export default function (data) {
  const page = Math.floor(Math.random() * PAGES) + 1;
  const res = http.get(`${BASE}/api/v1/tasks?page=${page}&limit=20`, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { name: 'GET /tasks' },
  });
  check(res, {
    'status 200': (r) => r.status === 200,
    'has data array': (r) => Array.isArray(r.json('data')),
    'meta.total present': (r) => r.json('meta.total') !== undefined,
  });
  sleep(Math.random() * 1.0 + 0.5); // think-time 0.5–1.5s
}
