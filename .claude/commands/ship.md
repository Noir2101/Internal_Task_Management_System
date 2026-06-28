---
description: Tự động hoá nguyên chuỗi giao việc git → commit → push → PR → squash-merge (resolve conflict nếu có) → xoá branch remote+local → về main pull. Squash merge, Conventional Commits.
argument-hint: "[--dry-run] [ghi chú commit/PR tuỳ chọn]"
---

Tự động đưa nhánh hiện tại lên `main` qua PR. Gọi `/ship` = **uỷ quyền chạy hết chuỗi** (gồm push,
tạo PR, merge, xoá branch). Chỉ DỪNG khi gặp lỗi/conflict không tự xử an toàn được — báo người, đừng đoán.

`$ARGUMENTS` có thể chứa `--dry-run` (chỉ in commit message + PR title dự định, KHÔNG thực thi gì)
và/hoặc ghi chú ngắn để nhét vào body PR.

## Bất biến an toàn (vi phạm = DỪNG, không lách)

- **KHÔNG bao giờ** force-push, `git push --force*` (kể cả `--force-with-lease`). Đồng bộ main bằng
  *merge main vào branch*, không rebase-rồi-force. Settings cũng deny các lệnh này.
- **KHÔNG** chạy trên `main`/`master`. Nhánh hiện tại là `main` → DỪNG, báo "phải đứng trên feature-branch".
- **KHÔNG** ship khi cổng đỏ. Lint/test/build phải xanh TRƯỚC khi commit.
- **KHÔNG** `--admin`/bypass branch-protection. Nếu PR bị chặn bởi required-check/approval → báo người, dừng.
- Resolve conflict phải **giữ đúng ý cả hai phía**; không vứt bừa một bên. Không chắc → dừng hỏi người.

## Convention commit (best practice — Conventional Commits, tiếng Anh)

**Commit thường** (lúc commit thay đổi trên branch):
```
<type>(<scope>): <subject ngắn, imperative, ≤72 ký tự, không dấu chấm cuối>

<thân: GIẢI THÍCH cái gì + tại sao, wrap ~72 cột. Bullet được. Bỏ qua nếu subject đã đủ.>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
- `type`: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore`.
- `scope` suy từ vùng đổi chính: `auth` `common` `tasks` `users` `teams` `stats` (src/<x>) ·
  `db`/`prisma` (prisma/) · `docs` (docs/) · `harness` (.claude/, scripts/). Đa-vùng → chọn vùng cốt lõi
  hoặc bỏ scope. **Một commit = một mục đích**; trộn feat với chore thì TÁCH thành 2 commit.
- `subject` mô tả KẾT QUẢ, không phải thao tác ("add roles guard" không phải "edit file").

**Commit lúc merge** (squash → 1 commit trên main): GitHub lấy **PR title** làm subject squash, nên
**PR title cũng phải đúng Conventional Commits** (GitHub tự thêm ` (#N)`). Squash body = phần tóm tắt PR.
Không để mặc định "Merge pull request…".

## Các bước (thực thi tuần tự; in kết quả gọn từng bước)

> `--dry-run`: làm tới hết Bước 2 ở mức *soạn message* rồi DỪNG, in commit message + PR title + danh
> sách file sẽ commit. Không `git add/commit/push`, không `gh`.

**0. Tiền điều kiện.** `git rev-parse --abbrev-ref HEAD` lấy branch. Nếu là `main`/`master` → DỪNG.
   `git fetch origin` để biết trạng thái remote.

**1. Cổng cơ học (pre-flight).** Chạy `npm run lint`, `npm test`, `npm run build`. Bất kỳ cái nào đỏ →
   in lỗi, DỪNG (đừng commit code hỏng). Đây là chốt chặn cuối trước khi đẩy lên remote.

**2. Stage + commit.**
   - `git status --short` + `git diff` (và `git diff --staged`) để hiểu thay đổi.
   - Có thay đổi chưa commit → `git add -A`, soạn message theo convention trên (suy type/scope từ diff),
     commit qua **heredoc** (giữ xuống dòng + trailer):
     ```
     git commit -F - <<'EOF'
     <type>(<scope>): <subject>

     <body>

     Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
     EOF
     ```
   - Tree đã sạch nhưng branch có commit vượt `main` (`git log --oneline origin/main..HEAD`) → bỏ qua commit,
     sang Bước 3. Tree sạch **và** không commit nào vượt main → không có gì để ship, DỪNG báo người.

**3. Push.** `git push -u origin <branch>`.

**4. Tạo / lấy PR.** `gh pr view <branch> --json number,url,state` để xem PR đã tồn tại chưa.
   - Chưa có → `gh pr create --base main --head <branch> --title "<PR title Conventional>" --body "<body>"`.
     - PR title = subject squash dự kiến (xem convention merge). PR body: **## Tóm tắt** (cái gì + tại sao) ·
       **## Test** (lint/test/build xanh + verify nếu có) · nhét ghi chú từ `$ARGUMENTS` nếu có.
   - Đã có (open) → tái dùng, cập nhật title/body nếu lệch (`gh pr edit`).

**5. Đồng bộ main + resolve conflict (không force-push).**
   - `git merge --no-edit origin/main`.
   - **Sạch / already up-to-date** → tiếp Bước 6.
   - **Conflict** → mở từng file conflict, hợp nhất giữ đúng ý cả hai phía (đọc context, không bỏ bừa).
     `git add <file đã giải>` → `git commit --no-edit` (merge commit; squash sẽ làm phẳng sau) →
     `git push`. Không chắc cách hợp nhất → `git merge --abort`, DỪNG, báo người.

**6. Squash-merge PR.**
   `gh pr merge <branch> --squash --delete-branch --subject "<PR title>" --body "<squash body>"`.
   - `--delete-branch` xoá branch **remote** (và local nếu gh làm được).
   - Báo "not mergeable"/conflict do GitHub phát hiện → quay lại Bước 5.
   - Bị required-check/approval/branch-protection chặn → DỪNG, báo người (KHÔNG `--admin`).

**7. Dọn local + về main.**
   - `git switch main` (no-op nếu gh đã chuyển).
   - `git pull --ff-only origin main` (kéo commit squash về).
   - `git fetch --prune` (dọn ref remote đã xoá).
   - Branch local còn sót (`git rev-parse --verify --quiet <branch>`) → `git branch -D <branch>`
     (squash khiến git coi branch "chưa merge" nên `-d` sẽ từ chối; `-D` là đúng SAU khi đã xác nhận PR merged).

**8. Báo cáo.** In: commit subject đã tạo · URL PR · trạng thái merge · branch đã xoá (remote+local) ·
   `git log --oneline -3` trên main để xác nhận commit squash đã đáp xuống.

## Khi nào KHÔNG dùng /ship

Đang giữa xung đột chưa quyết · muốn PR để người khác review trước khi merge (gọi tới Bước 4 rồi dừng tay) ·
nhánh chứa nhiều mục đích trộn lẫn nên cần tách commit/PR trước.
