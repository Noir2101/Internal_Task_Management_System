# Nhật ký triển khai — bug và phát hiện kỹ thuật

> Khác `deviations-log.md` (quyết định ở chỗ hợp đồng im lặng), file này ghi **bug thật đã
> bắt và sửa**, hoặc phát hiện kỹ thuật đáng giữ lại — kể cả khi không liên quan trực tiếp tới
> một câu spine nào. Đây là chất liệu để viết changelog, để giải trình lúc bị hỏi sâu, và để
> kể chuyện trong portfolio/interview.
>
> Không phải mọi commit đều cần entry. Chỉ ghi khi: (a) một bug có thể tái diễn nếu không ghi
> nguyên nhân gốc, hoặc (b) một quyết định kỹ thuật không hiển nhiên từ diff.

Quy ước mỗi entry:

```
## [Bước N] <tiêu đề ngắn> — YYYY-MM-DD
- Triệu chứng: ...
- Nguyên nhân gốc: ...
- Sửa: file:line, mô tả ngắn
- Verify: ...
```

---

## [Bước 2] Reuse-detection revoke family bị rollback vì throw trong `$transaction` — 2026-06-27
- Triệu chứng: Sau khi reuse-detection "thu hồi cả family", token con (đã rotate) VẪN refresh được (HTTP 200) thay vì 401 — family không thực sự bị revoke.
- Nguyên nhân gốc: Nhánh reuse gọi `tx.refreshToken.updateMany(revoke family)` rồi `throw SessionExpiredException` NGAY trong cùng `prisma.$transaction(...)`. Throw làm transaction rollback → cuốn theo cả updateMany revoke. Sai semantics: một side-effect cần-commit không được đặt cùng transaction với đường ném-lỗi-để-từ-chối.
- Sửa: src/auth/auth.service.ts:84-117 — transaction trả về outcome (`'invalid' | 'ok'`) thay vì throw bên trong; throw SessionExpired SAU khi commit. Thêm CAS `updateMany where {id, usedAt:null, revokedAt:null} set usedAt=now` (count=0 ⇒ thua đua ⇒ invalid) để giữ đảm bảo atomic chống double-rotate mà không cần throw-để-rollback.
- Verify: curl — login→refresh(rotate)→trình lại cookie cũ (401 SESSION_EXPIRED + clear) → token con CŨNG 401 (trước sửa: 200). build/lint/test xanh.

---

## [Bước 4] Tách 2 token port (TaskWritePort / TaskQueryPort) thay vì 1 `TASK_REPOSITORY` — 2026-06-29
- Triệu chứng: (không phải bug) snippet wiring ở `src/tasks/CLAUDE.md` ghi `{ provide: TASK_REPOSITORY, useClass: PrismaTaskRepository }` (1 token), nhưng cùng file đòi ISP "Stats chỉ thấy port đọc".
- Nguyên nhân gốc / quyết định: 1 token không cấp được cho consumer (Bước 6 Stats) một view chỉ-đọc qua DI. Tách 2 token `TASK_WRITE_PORT` + `TASK_QUERY_PORT`, CẢ hai do `PrismaTaskRepository` hiện thực, bind qua `useExisting` (một instance dùng chung). Module chỉ `exports: [TASK_QUERY_PORT]` → Stats không với tới được port ghi.
- Sửa: src/tasks/tasks.module.ts (providers + exports) · src/tasks/application/ports/task-{write,query}.port.ts.
- Verify: build/lint/test xanh (25/25) + HTTP verify 31/31. Gotcha kèm: type port inject trong constructor có `@Inject` phải dùng `import type` (isolatedModules + emitDecoratorMetadata) — nếu không, TS1272.

---

## [Bước 5] Users tiêu thụ artifact Tasks (deep) qua port đọc + Notifier — 2026-06-30
- Triệu chứng: (không phải bug) luồng `deactivate` cần đếm task treo + báo leader, nhưng `TaskQueryPort` chỉ có `findByIdScoped`/`list` (đều scoped) và `Notifier` chỉ có `notifyReassigned`; `TasksModule` chỉ export `TASK_QUERY_PORT`.
- Quyết định kỹ thuật (không hiển nhiên từ diff):
  - Thêm `TaskQueryPort.countByAssignee(assigneeId)` **non-scoped** (đếm chéo nhóm theo assigneeId, chưa-DONE + non-deleted) — admin deactivate KHÔNG có nhóm nên không thể đi qua scoped-load; tách rõ khỏi `findByIdScoped`/`list` (scoped) làm read đặc quyền.
  - Mở rộng `Notifier` thêm `notifyTasksOrphaned` (NoopNotifier no-op, seam); `TasksModule` export thêm `NOTIFIER`; `UsersModule` import `TasksModule`, inject cả hai. Chiều phụ thuộc Users→Tasks (build-plan §1) — Tasks/Stats KHÔNG phụ thuộc ngược Users.
  - Notifier phát **SAU commit** `$transaction` (tái dùng bài học Bước 2: side-effect cần-commit không đặt cùng transaction đường-ném-lỗi). Leader-swap: demote leader cũ → MEMBER **TRƯỚC** rồi promote (giữ ≤1 LEADER/team — không vỡ partial-unique `user_one_leader_per_team`; lúc promote không còn LEADER khác).
- Phát hiện: `LAST_ADMIN` (đếm admin-active khác target == 0) thực tế **bị che bởi `CANNOT_DISABLE_SELF`** — endpoint admin-only ⇒ caller luôn là admin-active; caller≠target ⇒ `otherActiveAdmins≥1` (chính caller), caller==target ⇒ self bắt trước. Giữ guard làm phòng thủ (registry §7.3 liệt kê `LAST_ADMIN`) nhưng không reachable qua hợp đồng hiện tại — không phải bug, là hệ quả thứ-tự-guard self→leader→last-admin.
- Verify: build/lint/test xanh (25/25) + HTTP verify tay 44/44 (gồm: refresh sau deactivate → 401 SESSION_EXPIRED; swap atomic demote/promote; orphanedTaskCount=2 loại DONE+soft-deleted; mass-assignment PATCH role → 400). Gotcha (đã biết từ Bước 4): type port inject `@Inject` phải `import type` — đã áp dụng ở users.service.ts.

---

## [Bước 6] Stats tiêu thụ aggregate read-model — outer-join User×Task TRONG adapter Tasks — 2026-06-30
- Triệu chứng: (không phải bug) Bước 4 HOÃN `TaskQueryPort.aggregate` tới đây; Bước 6 phải thiết kế shape (docs/06 §5) + hiện thực outer-join `byAssignee` mà KHÔNG cho `stats/` chạm Prisma (cổng 1) và KHÔNG kéo module Users/Teams vào.
- Quyết định kỹ thuật (không hiển nhiên từ diff):
  - `aggregate(scopeTeamId, now)` là **một method trả full shape** `{scope,total,byProgress,overdue,byAssignee}`, hiện thực trong `PrismaTaskRepository` (adapter Tasks). Stats inject CHỈ `TASK_QUERY_PORT` + `CLOCK` — ISP, không thấy write port; `stats/` 0 import Prisma (cổng 1 ESLint).
  - **Outer-join trong adapter, không N+1:** 2 `groupBy` (`[assigneeId,progress]` cho byProgress + `[assigneeId]` với `overduePredicate` cho overdue) ∪ `user.findMany(active members)` ∪ tra tên cho assignee inactive-còn-task (`id in extraIds`). Khởi tạo mỗi người `{TODO:0,IN_PROGRESS:0,DONE:0}` ⇒ member rảnh hiện 0; member inactive-còn-task-treo VẪN hiện (đóng kẽ "task rơi khỏi phân rã").
  - **Team-level DERIVE bằng reduce per-assignee** (không query riêng) ⇒ cấu trúc bảo chứng `total = Σ byProgress = Σ byAssignee` và `team.overdue = Σ assignee.overdue` — một trong 3 bất biến OVERDUE đúng-by-construction, không nhờ kỷ luật.
  - **Tách `overduePredicate(now)`** dùng CHUNG cho `buildListWhere` (filter `?overdue=true`) lẫn `aggregate` ⇒ predicate `deadline<now AND progress!=DONE` không thể lệch giữa list và stats; cùng mốc `now` từ Clock (cổng 3).
  - **`teamName` đọc bảng Team TRONG adapter** (`prisma.team.findUnique`) — Tasks adapter vốn đã đọc bảng User cho assignee; đọc bảng Team là cùng pattern, KHÔNG phụ thuộc module Teams. Stats không thấy Prisma.
  - Gotcha cổng 1: `stats/` cấm `@prisma/client` ⇒ controller dùng `@Roles(['LEADER'])` chuỗi literal thay `Role.LEADER` (vẫn type-check vì `Role = 'ADMIN'|'LEADER'|'MEMBER'`).
- Verify: build/lint/test xanh (28/28, +3 projection spec khoá bất biến 3-key) + HTTP verify tay: BE leader total=6 byProgress{3,2,1} overdue=2 (loại DONE-quá-hạn) Σbyassignee=6; deactivate beB → vẫn hiện trong byAssignee; FE leader scope tách (teamName=Frontend); member+admin → 403 INSUFFICIENT_ROLE.

---

## [Bước 7] Hardening — Prisma-net + break-glass + throttle + Swagger (rìa, tái dùng scaffold) — 2026-07-01
- Triệu chứng: (không phải bug) Bước 7 gắn 4 hạng mục ở RÌA; rủi ro là đảo "domain pre-check là chính / Prisma map là lưới" và đẻ code/tầng mới không cần.
- Quyết định kỹ thuật (không hiển nhiên từ diff):
  - **Tái dùng `STATUS_CODE_MAP[429]→RATE_LIMITED`** đã có từ thiết kế filter — `ThrottlerException` là 429 `HttpException` nên đi đúng nhánh `instanceof HttpException`, KHÔNG cần viết lại map. Nhánh Prisma đặt SAU `HttpException`, TRƯỚC catch-all 500; `TeamNotEmptyException` (AppException) vẫn vào nhánh đầu ⇒ domain pre-check là đường chính, chỉ raw P-code mới chạm `mapPrismaError`.
  - **Phát hiện FK (đáng nhớ):** `User.teamId` FK `onDelete:Restrict` chặn theo SỰ-TỒN-TẠI-ROW, không theo `isActive`; cộng `teamId` bất biến (§9.5) ⇒ deactivate KHÔNG giải phóng nhóm. Hệ quả: §9.4 prose "dọn = vô hiệu hoá hết member" sai thực tế; "deactivate hết → DELETE → 204" bất khả. Chốt "rỗng = đếm CẢ User (kể cả inactive)" để pre-check khớp đúng FK (count>0 ⟺ FK chặn) ⇒ P2003 thuần đua. (FLAG ở deviations-log để người xem §9.4.)
  - **`trust proxy` gotcha:** `app.set('trust proxy', 1)` cần app kiểu `NestExpressApplication` (`NestFactory.create<NestExpressApplication>`) — `INestApplication` không có `.set`. Không bật thì sau reverse-proxy prod mọi client chung một IP-bucket ⇒ throttle login vô dụng.
  - **Log seam ghi TRƯỚC `next.handle()`** (BreakGlassInterceptor) — log NGAY khi vào nên cả lần bị 409 (nhóm còn member) cũng được ghi, đúng "mỗi lần gọi" §9.4 (không chỉ lần 204 thành công).
  - **Swagger thuần additive:** `ErrorEnvelopeResponse` đăng ký qua `extraModels` để schema xuất hiện dù không endpoint nào `@ApiResponse` nó — KHÔNG đổi shape/luật, cổng 2 projection không liên quan (model tài liệu, không serialize Prisma).
- Verify: build/lint/test xanh (37/37, +9 case khoá bảng Prisma-map). Manual-via-seed: DELETE nhóm còn member→409; POST nhóm rỗng→DELETE→204→GET→404 + dòng `[BreakGlass]` JSON; throttle >5 login/phút→429 RATE_LIMITED+Retry-After, endpoint khác không siết; Swagger render 4 example + envelope.

---

## Cách thêm entry mới

Thêm cuối file, theo thứ tự thời gian. Gắn số Bước (theo `CLAUDE.md` §trình tự build) để dễ tra
khi quay lại một module. Không cần entry cho mọi commit — chỉ bug có nguyên nhân gốc đáng nhớ,
hoặc quyết định không hiển nhiên từ diff.
