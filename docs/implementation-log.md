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

## Cách thêm entry mới

Thêm cuối file, theo thứ tự thời gian. Gắn số Bước (theo `CLAUDE.md` §trình tự build) để dễ tra
khi quay lại một module. Không cần entry cho mọi commit — chỉ bug có nguyên nhân gốc đáng nhớ,
hoặc quyết định không hiển nhiên từ diff.
