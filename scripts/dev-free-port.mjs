// Giải phóng cổng trước khi `start:dev`. Chống bẫy "một dev server cũ (CODE CŨ) còn treo từ
// phiên trước giữ cổng" → verify nhầm code cũ mà tưởng code mới. Idempotent: cổng trống thì no-op,
// LUÔN exit 0 để chuỗi `&& nest start` chạy tiếp. Cross-platform theo process.platform.
//
// Dùng: node scripts/dev-free-port.mjs [port]   (mặc định argv[2] ?? PORT ?? 3000)
import { execSync } from 'node:child_process';

const port = process.argv[2] ?? process.env.PORT ?? '3000';
const isWin = process.platform === 'win32';

/** Chạy lệnh, nuốt lỗi (non-zero/không tìm thấy) → trả '' để script không bao giờ vỡ. */
function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function pidsOnPort() {
  if (isWin) {
    // netstat: "TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  <pid>"
    const set = new Set();
    for (const raw of run('netstat -ano').split(/\r?\n/)) {
      const f = raw.trim().split(/\s+/);
      if (f.length >= 5 && f[0] === 'TCP' && f[3] === 'LISTENING' && f[1].endsWith(`:${port}`)) {
        set.add(f[4]);
      }
    }
    return [...set];
  }
  return run(`lsof -ti tcp:${port} -sTCP:LISTEN`)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

for (const pid of pidsOnPort()) {
  if (!/^\d+$/.test(pid)) continue;
  run(isWin ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`);
  console.log(`[dev-free-port] :${port} đã chiếm bởi pid ${pid} → killed`);
}

process.exit(0);
