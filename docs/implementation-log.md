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

## Cách thêm entry mới

Thêm cuối file, theo thứ tự thời gian. Gắn số Bước (theo `CLAUDE.md` §trình tự build) để dễ tra
khi quay lại một module. Không cần entry cho mọi commit — chỉ bug có nguyên nhân gốc đáng nhớ,
hoặc quyết định không hiển nhiên từ diff.
