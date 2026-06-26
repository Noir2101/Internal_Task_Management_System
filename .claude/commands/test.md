---
description: Chạy test cho một module. GĐ7 chỉ test keystone domain, coverage rộng để GĐ8.
argument-hint: <module>
---

Chạy test cho module `$ARGUMENTS`.

## Kỷ luật GĐ7

Test-as-you-go CHỈ cho **keystone domain**, không cho CRUD mỏng. Coverage rộng để dành GĐ8.

- `$ARGUMENTS = tasks` → chạy:
  - `TaskPolicy` — nhánh owner / assignee / cùng-nhóm.
  - `DueStatus` — OVERDUE với clock cố định; ca DONE-quá-hạn KHÔNG overdue; deadline NULL không overdue.
  - ownership ≠ assignment.
  - keystone integration — `GET /tasks/:id` cho 404 (ngoài nhóm) / 403 (sai quyền) / projection đúng.
- `$ARGUMENTS` = `auth` / `users` / `teams` / `stats` → GĐ7 chưa cần test sâu. Nếu chạy, chỉ smoke. Nhắc người: coverage thuộc GĐ8.

## Lệnh

`npm test -- $ARGUMENTS`  (hoặc pattern path tương ứng, ví dụ `npm test -- tasks/domain`).

## Nhắc

Test domain KHÔNG cần DB — dùng fake in-memory repo thay `PrismaTaskRepository`. Đó là điểm của hexagonal. Nếu test domain đòi DB là đã sai tầng, báo lại.
