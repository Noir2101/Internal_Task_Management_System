---
description: Tạo/chạy Prisma migration đúng kỷ luật, gồm 4 ràng buộc raw-SQL không-model-được.
---

Quản migration cho ITMS. Tuyệt đối **KHÔNG `prisma db push`**, **KHÔNG `prisma migrate reset`** (xoá data).
Nếu nghĩ cần một trong hai, DỪNG và hỏi người.

## Migration thường (đổi thứ Prisma model được)

`npx prisma migrate dev --name <tên>` → review SQL sinh ra → để Prisma apply.

## Migration đầu, hoặc khi đụng ràng buộc raw-SQL

Schema có 4 object Prisma KHÔNG biểu diễn được, phải thêm tay (nguồn: header `schema.prisma`):

1. `npx prisma migrate dev --create-only --name <tên>`  (sinh file SQL, CHƯA apply).
2. Mở `prisma/migrations/<...>/migration.sql`, thêm vào cuối:

   ```sql
   -- CHECK: ADMIN khi và chỉ khi không có nhóm
   ALTER TABLE "User" ADD CONSTRAINT user_admin_no_team
     CHECK ((role = 'ADMIN') = ("teamId" IS NULL));

   -- CHECK: title không rỗng / không chỉ khoảng trắng
   ALTER TABLE "Task" ADD CONSTRAINT task_title_not_blank
     CHECK (length(trim(title)) > 0);

   -- partial unique: tối đa 1 LEADER mỗi nhóm
   CREATE UNIQUE INDEX user_one_leader_per_team
     ON "User"("teamId") WHERE role = 'LEADER';

   -- partial index: đỡ predicate OVERDUE
   CREATE INDEX task_overdue
     ON "Task"(deadline) WHERE progress <> 'DONE' AND "deletedAt" IS NULL;
   ```

3. Review lại toàn bộ SQL, rồi `npx prisma migrate dev` để apply.
4. Seed nếu cần: `npx prisma db seed`.

## Verify sau apply

Xác nhận 4 object tồn tại rồi báo kết quả:
- 2 CHECK: query `pg_constraint` theo `conname IN ('user_admin_no_team','task_title_not_blank')`.
- 2 index: query `pg_indexes` theo `indexname IN ('user_one_leader_per_team','task_overdue')`.

Thiếu bất kỳ object nào = migration chưa đúng spine, sửa trước khi đi tiếp.
