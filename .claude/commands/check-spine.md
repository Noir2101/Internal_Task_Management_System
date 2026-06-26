---
description: Soi diff hiện tại đối chiếu bất biến spine ITMS trước khi commit. Không tự sửa, chỉ báo.
---

Bạn đang review diff GĐ7 đối chiếu spine ITMS (xem `CLAUDE.md` + `docs/06-api-contract.md`).
KHÔNG sửa code. Chỉ báo cáo PASS/FAIL theo nhóm, kèm `file:line` cho mỗi vi phạm.

## Bước 1 — chạy cổng cơ học (cái lint/test bắt được, đừng soi tay)

- `npm run lint` — domain purity (`tasks/domain` không Prisma/Nest), stats purity (`stats` không Prisma).
- `npm test` — keystone (404/403), projection (field cấm không lộ), OVERDUE (computed, clock cố định), ownership ≠ assignment.
- Có fail → liệt kê cụ thể, DỪNG ở đây, không cần soi tiếp.

## Bước 2 — soi phán đoán (cổng cơ học KHÔNG bắt được)

Đi qua diff, kiểm từng mục, trích `file:line`:

- **Projection:** response build từ mapper whitelist, không `return <prismaModel>` thẳng? `owner`/`assignee` chỉ `{id,name}`?
- **Server-derived:** `ownerId`/scope lấy từ JWT, KHÔNG nhận từ body/param? `GET /tasks` không có `teamId`?
- **one-law-per-endpoint:** mỗi endpoint đúng một chủ thể (owner/assignee/leader)? reassign leader-only?
- **Envelope & status:** đúng shape + `code` nằm trong registry (`docs/06` §7.3)? Không 422? `details[]` chỉ ở `VALIDATION_FAILED`?
- **DTO vs domain:** DTO chỉ validation hình thức? Luật nghiệp vụ nằm ở domain/use-case, không nhét vào DTO?
- **Stats:** chỉ gọi `TaskQueryPort`? Không import Prisma hay module Users trong `stats/`? `byProgress` đúng 3 key, `overdue` là sibling không phải bucket thứ tư?
- **progress:** không có máy trạng thái tự thêm (bất kỳ → bất kỳ)?
- **lifecycle:** không có đường đổi `teamId`/`role` ngoài leader-swap?

## Bước 3 — spine để ngỏ

Có chỗ nào code tự quyết một hành vi mà `docs/06` không nói (sort mặc định mới, field projection chưa khai báo, `code` lỗi mới)? Flag ra và đề nghị hỏi người — KHÔNG coi là PASS.

## Output

Mỗi nhóm: **PASS** / **FAIL** + vi phạm cụ thể (`file:line`). Cuối: danh sách việc cần sửa. Không tự sửa.
