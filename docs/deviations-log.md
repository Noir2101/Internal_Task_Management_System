# Phụ lục hợp đồng — quyết định ở chỗ spine để ngỏ

> File này KHÔNG sửa lại GĐ1–6 hay `CLAUDE.md`. Nó ghi những chỗ hợp đồng **im lặng**, mà
> lúc code phải quyết một giá trị cụ thể để chạy được. Mỗi entry đã được duyệt qua `/check-spine`
> hoặc qua plan-mode review trước khi commit — đây là truy vết, không phải đề xuất.
>
> Khi đọc lại code và thấy "tại sao chỗ này làm vậy mà sáu doc không nói" — tra ở đây trước khi
> nghi là bug.

Quy ước mỗi entry. Field `Loại` phân biệt hai bản chất khác nhau:
- **phụ-lục-vĩnh-viễn** — hợp đồng IM LẶNG (không nói), quyết định ở đây là chỗ ở mãi mãi.
- **chờ-bổ-sung-spine** — hợp đồng ĐÓNG nhưng thiếu một phần **FE-observable** (code/status/field hệ
  SẼ phát ra). Entry này là tạm: khi phần đó GO-LIVE, phải tốt nghiệp lên docs/06 §X (người duyệt),
  rồi đóng entry. Đừng để nó kẹt ở phụ lục.

```
### <tiêu đề ngắn>
- Loại: phụ-lục-vĩnh-viễn | chờ-bổ-sung-spine (→ docs/06 §X, Bước N)
- Trạng thái: mở | đã đóng (đóng ở Bước N, ngày ...)
- Vị trí: file:line
- Hợp đồng nói gì: ...
- Quyết định: ...
- Lý do: ...
```

---

### `GET /health` — vị trí so với prefix + shape response (Bước 1)
- Loại: phụ-lục-vĩnh-viễn
- Trạng thái: mở (endpoint hạ tầng, ngoài surface hợp đồng — không có hạn đóng)
- Vị trí: src/health/health.controller.ts:14
- Hợp đồng nói gì: docs/06 không liệt kê `/health` — nó là endpoint hạ tầng, ngoài contract surface.
- Quyết định: đặt DƯỚI prefix → `GET /api/v1/health`; thành công trả `200 {status:'ok'}`; DB lỗi để exception filter trả `500 INTERNAL_ERROR` + requestId.
- Lý do: giữ một luật "mọi route dưới /api/v1" (khỏi cấu hình setGlobalPrefix exclude); hiện cùng chỗ với mọi route trên Swagger. Đã review với người lúc plan Bước 1.

---

### Cookie `Secure` gate theo `NODE_ENV` (Bước 2)
- Loại: phụ-lục-vĩnh-viễn
- Trạng thái: mở (không có hạn đóng — prod luôn set Secure)
- Vị trí: src/auth/refresh-cookie.ts:13
- Hợp đồng nói gì: §6.4 liệt kê thuộc tính cookie `Secure` (literal, không điều kiện).
- Quyết định: `secure: process.env.NODE_ENV === 'production'` — prod set Secure; dev (http://localhost) bỏ Secure.
- Lý do: cookie `Secure` không gửi qua http → refresh gãy ở dev local. Hành vi prod khớp đúng §6.4; chỉ nới ở dev. Duyệt ở plan Bước 2.

---

### `POST /auth/refresh` không chặn user `isActive=false` (Bước 2)
- Loại: phụ-lục-vĩnh-viễn (không đẻ code FE-observable; chỉ là quyết định KHÔNG thêm nhánh)
- Trạng thái: **đã đóng** (đóng ở Bước 5, 2026-06-30 — `POST /users/:id/deactivate` revoke MỌI refresh token sống của user trong cùng `$transaction` với `isActive=false`. Verify tay: login member → refresh OK → deactivate → refresh lại bằng cookie đã rotate → 401 SESSION_EXPIRED. Điểm enforce đúng là deactivate, không phải nhánh isActive ở refresh — staleness ≤ access TTL giữ nguyên §6.4.)
- Vị trí: src/auth/auth.service.ts:110
- Hợp đồng nói gì: §6.2 chỉ liệt kê 200 + SESSION_EXPIRED cho refresh; im lặng về isActive.
- Quyết định: refresh KHÔNG kiểm isActive; chỉ map lỗi token → SESSION_EXPIRED.
- Lý do: theo mô hình staleness ≤ access TTL (§6.4) — đổi trạng thái lan trong ≤15m. Điểm enforce đúng là lúc deactivate (revoke refresh token + cả family) ở Bước 5. Thêm nhánh isActive ở refresh giờ sẽ phải đẻ một code không có trong registry.

---

### Tên biến .env cho JWT/refresh (Bước 2)
- Loại: phụ-lục-vĩnh-viễn
- Trạng thái: mở (không có hạn đóng)
- Vị trí: src/auth/auth.module.ts:16, src/auth/auth.service.ts:44
- Hợp đồng nói gì: docs/06 không đặt tên biến môi trường.
- Quyết định: `JWT_ACCESS_SECRET` (bắt buộc, getOrThrow → fail-fast), `JWT_ACCESS_TTL=15m`, `REFRESH_TTL_DAYS=7`. Refresh token là opaque random → KHÔNG có secret riêng.
- Lý do: 15m khớp ghi chú §6.4 (token cũ ≤15m); 7d khớp Max-Age §6.4. .env trong .gitignore (không commit secret). Duyệt ở plan Bước 2.

---

### `GET /auth/me` khi token hợp lệ nhưng user biến mất (Bước 2)
- Loại: phụ-lục-vĩnh-viễn
- Trạng thái: mở (edge phòng thủ; không có hạn đóng)
- Vị trí: src/auth/auth.service.ts:131
- Hợp đồng nói gì: §6.2 chỉ mô tả 200 {user}; im lặng ca user không còn.
- Quyết định: trả 401 TOKEN_INVALID.
- Lý do: refresh token cascade theo user nên ca này gần như bất khả (token sống ⇒ user còn); nếu xảy ra, coi access token đã vô nghĩa. Dùng code có sẵn trong registry, không bịa code mới.

---

### Code 403 role-deny ở rìa — split theo keystone (Bước 3 · GO-LIVE Bước 6: `FORBIDDEN`→`INSUFFICIENT_ROLE`)
- Loại: **chờ-bổ-sung-spine** → docs/06 §7.3, Bước 6 (đã GO-LIVE — người duyệt thêm dòng `INSUFFICIENT_ROLE | 403` (nhóm task/chung) vào registry §7.3 + ví dụ vào bảng §10, rồi đánh dấu entry này đã đóng)
- Trạng thái: **đã đóng** (Bước 6, 2026-06-30 — `GET /stats` leader-only phát code thật; tên CHỐT `INSUFFICIENT_ROLE` (đổi từ `FORBIDDEN`, qua AskUserQuestion); người duyệt đã thêm dòng `INSUFFICIENT_ROLE | 403` vào docs/06 §7.3 + ví dụ §10 (amendment có-đánh-dấu). Verify tay: member→403, admin→403.)
- Vị trí: src/stats/stats.controller.ts:31 (`@Roles(['LEADER'], {forbid, code:'INSUFFICIENT_ROLE'})`), src/common/authz/roles.guard.ts:42 (throw `ForbiddenError`), src/common/authz/roles.decorator.ts (convention `DenyMode` + ví dụ comment cập nhật `INSUFFICIENT_ROLE`)
- Hợp đồng nói gì: registry §7.3 KHÔNG có code 403 chung cho "sai vai trò ở rìa" — chỉ có code record-level cụ thể (`NOT_TASK_OWNER`...). §5 lại nói `/stats` dùng 403; §3.3 nói admin có phạm vi toàn hệ thống còn non-admin chỉ thấy phạm vi mình.
- Quyết định: `RolesGuard` cấu hình `onDeny` hai nhánh theo trục keystone "thấy-được↔403 / không-thấy↔404":
  - `hide` → 404 `RESOURCE_NOT_FOUND` (code có sẵn). Cho surface non-admin KHÔNG được thấy tồn tại — `/users`,`/teams` admin-only.
  - `forbid` → 403 + **code mới `INSUFFICIENT_ROLE`** (chốt Bước 6). Cho resource người gọi THẤY ĐƯỢC nhưng sai vai trò — member gọi `/stats` (đã thấy nhóm mình qua `/tasks`, `/teams/:id/members`); admin gọi `/stats` cũng 403 CÙNG code (xem entry "Stats — chỗ §5 im lặng (Bước 6)").
- Lý do: split này giữ đúng keystone — 403 ở `/stats` không lộ thêm gì (member đã thấy nhóm), 404 ở `/users`,`/teams` giấu trọn surface admin. Thêm một code 403 chung vào hợp đồng = sửa registry → đã hỏi & người duyệt qua plan-mode AskUserQuestion (Luật số 0). docs/06 §7.3 đông cứng nên agent KHÔNG sửa tại chỗ; entry này giữ chỗ tới khi go-live (Bước 6) thì người đưa vào §7.3. Tên CHỐT `INSUFFICIENT_ROLE` (rõ hơn `FORBIDDEN`/`FORBIDDEN_ROLE`: nói rõ "thiếu vai trò" — khác record-level `NOT_TASK_OWNER`...) qua AskUserQuestion Bước 6, TRƯỚC khi khoá registry+FE.

---

### Tasks — status/body khi mutation thành công (Bước 4)
- Loại: **chờ-bổ-sung-spine** → docs/06 §8.2/§10, Bước 4 (đã GO-LIVE — người duyệt nên thêm một dòng vào §8/§10 xác nhận body từng endpoint, rồi đóng entry)
- Trạng thái: mở
- Vị trí: src/tasks/interface/tasks.controller.ts (POST create · PATCH edit/progress/assignee · DELETE remove)
- Hợp đồng nói gì: §10 liệt kê 201/200/204 và luật "200 kèm body cho trạng thái mới · 204 cho thao tác không cần thân"; §8.2 định nghĩa shape `TaskResponse`. Nhưng KHÔNG nói tường minh mỗi endpoint mutation trả status/body nào.
- Quyết định: `POST /tasks` → **201 + TaskResponse**; `PATCH /:id`, `/:id/progress`, `/:id/assignee` → **200 + TaskResponse** (đã projection, gồm cờ `overdue` tính lại cùng `now`); `DELETE /:id` → **204** (không body, GET sau đó 404).
- Lý do: suy thẳng từ luật §10 (tạo→201 · cần trạng thái mới→200+body · xoá→204) + projection §8.2 — FE nhận task tươi, không phải refetch. Duyệt qua plan-mode AskUserQuestion (Luật số 0).

---

### Tasks — reuse code §7.3 cho ca authz hợp đồng không liệt kê (Bước 4)
- Loại: phụ-lục-vĩnh-viễn (KHÔNG đẻ code mới — chỉ tái dùng code có sẵn trong registry §7.3 cho call-site mới)
- Trạng thái: mở (không hạn đóng)
- Vị trí: src/tasks/application/reassign-task.usecase.ts:39,50 · src/tasks/application/create-task.usecase.ts:43,52
- Hợp đồng nói gì: §3.1 reassign leader-only; §8.1 target reassign phải "thuộc nhóm và đang hoạt động"; §2 POST chỉ leader/member. Nhưng §7.3 KHÔNG có code riêng cho "member gọi reassign", "target inactive", hay "admin gọi POST".
- Quyết định (đều record-level, assert SAU scoped-load nên cross-team vẫn 404 đúng keystone — KHÔNG dùng `RolesGuard` ở rìa cho tasks):
  - member (in-team) gọi `PATCH /:id/assignee` → 403 `TASK_MEMBER_SELF_ASSIGN_ONLY` (khớp §7.4 "member giao cho người khác"). KHÔNG dùng `FORBIDDEN` (đó là code role-ở-rìa của RolesGuard).
  - reassign target ngoài-nhóm HOẶC inactive → 403 `TASK_ASSIGNEE_NOT_IN_TEAM` (gộp 2 ca: "không phải assignee hợp lệ đang hoạt động trong nhóm").
  - admin (teamId null) gọi `POST /tasks` → 403 `TASK_ASSIGNEE_NOT_IN_TEAM` (admin ngoài cây tổ chức, không assignee in-team → tự bị chặn, khớp §3.2).
- Lý do: tránh đẻ code mới (Luật số 0) — mọi ca map khít vào code có sẵn. Duyệt qua plan-mode AskUserQuestion + plan review.

---

### Users/Teams — status/body + projection shape khi spine im lặng (Bước 5)
- Loại: **chờ-bổ-sung-spine** → docs/06 §8.2/§10, Bước 5 (đã GO-LIVE — người duyệt thêm dòng xác nhận body từng endpoint + định nghĩa Team projection/roster vào §8.2/§10, rồi đóng entry)
- Trạng thái: mở
- Vị trí: src/users/users.controller.ts · src/teams/teams.controller.ts · src/users/dto/user.response.ts · src/teams/dto/team.response.ts
- Hợp đồng nói gì: §10 cho luật 201/200/204 nhưng KHÔNG nói tường minh status/body từng endpoint Users/Teams; §8.2 định nghĩa UserResponse (7 field) nhưng KHÔNG định nghĩa Team projection hay shape roster.
- Quyết định: POST /users,/teams → **201 + Response**; PATCH /users,/teams → **200 + Response**; PUT /teams/:id/leader → **200 + TeamResponse**; deactivate → **200 {user: UserResponse đầy đủ, orphanedTaskCount}**; reactivate → **200 {user: UserResponse đầy đủ}**. **TeamResponse = {id,name,createdAt}** (mirror UserResponse, bỏ updatedAt); **roster GET /teams/:id/members = [{id,name}]** (brief như owner/assignee/stats).
- Lý do: suy thẳng luật §10 (tạo→201 · cần-trạng-thái-mới→200+body) + tiền lệ Bước 4; full UserResponse cho deactivate/reactivate vì §9.3 ví dụ {id,isActive} chỉ minh hoạ; Team không có cột leader nên PUT leader trả chính TeamResponse (leader mới xem qua roster). Duyệt qua plan-mode AskUserQuestion (Luật số 0).

---

### Users/Teams — default sort + phân trang khi spine im lặng (Bước 5)
- Loại: **chờ-bổ-sung-spine** → docs/06 §9.2/§4.2, Bước 5
- Trạng thái: mở
- Vị trí: src/users/users.service.ts (list) · src/teams/teams.service.ts (list)
- Hợp đồng nói gì: Luật số 0 nêu ĐÍCH DANH "default sort GET /users" còn để ngỏ; §9.2 nói /users "có phân trang" nhưng IM LẶNG shape meta + IM LẶNG phân trang cho /teams.
- Quyết định: default sort **createdAt DESC, id DESC** cho cả /users & /teams (mirror Tasks §4.1, trang tất định); GET /users dùng meta **{page,limit,total,totalPages}** (như §4.2; limit default 20 trần 100; includeInactive default false → mặc định loại inactive); GET /teams trả **mảng thường** (không phân trang — §9.2 chỉ đòi cho /users, nhóm ít).
- Lý do: một convention sort duy nhất toàn API; không over-paginate danh sách nhóm nhỏ. Duyệt qua AskUserQuestion.

---

### `orphanedTaskCount` đếm chưa-DONE, non-scoped (Bước 5)
- Loại: **chờ-bổ-sung-spine** → docs/06 §9.3, Bước 5
- Trạng thái: mở
- Vị trí: src/tasks/infrastructure/prisma-task.repository.ts (countByAssignee) · src/users/users.service.ts (deactivate)
- Hợp đồng nói gì: §9.3 trả `orphanedTaskCount` ("task treo") nhưng IM LẶNG đếm tập nào (mọi task non-deleted hay chỉ chưa-DONE) và scope.
- Quyết định: đếm **chỉ chưa-DONE** (TODO+IN_PROGRESS), non-deleted, **non-scoped** theo assigneeId của user bị deactivate (đường mới `TaskQueryPort.countByAssignee` — admin không nhóm nên không đi qua scoped-load).
- Lý do: "task treo" = việc còn cần leader reassign; DONE không cần giao lại. Non-scoped vì đếm chéo theo assigneeId. Verify tay: deactivate beB → count=2 (loại 1 DONE + 1 đã soft-delete). Duyệt qua AskUserQuestion.

---

### Password policy POST /users = MinLength(8) (Bước 5)
- Loại: phụ-lục-vĩnh-viễn (formal validation; docs không đặt rule cụ thể)
- Trạng thái: mở (không hạn đóng)
- Vị trí: src/users/dto/create-user.dto.ts
- Hợp đồng nói gì: §8.1 "password theo chính sách", §9.2 "theo FR-AUTH-01" — nhưng FR-AUTH-01/SEC-05 chỉ nói "admin đặt mật khẩu tạm" / "validate độ dài" CHUNG CHUNG, KHÔNG đặt rule cụ thể.
- Quyết định: **MinLength(8)**, KHÔNG đòi độ phức tạp. Sai → 400 VALIDATION_FAILED + details[].
- Lý do: mật khẩu tạm do admin đặt; argon2 lo phần hashing; tránh over-engineer rule độ phức tạp. Duyệt qua AskUserQuestion (Luật số 0 — docs im lặng → hỏi, không tự đặt rule).

---

### Edge im lặng Users — bogus teamId → 404, idempotent deactivate/reactivate (Bước 5)
- Loại: phụ-lục-vĩnh-viễn (reuse code có sẵn trong registry, KHÔNG đẻ code mới)
- Trạng thái: mở (không hạn đóng)
- Vị trí: src/users/users.service.ts (create, deactivate, reactivate)
- Hợp đồng nói gì: §9 không nói ca POST /users với `teamId` trỏ team không tồn tại, hay deactivate/reactivate lặp lại.
- Quyết định: POST /users `teamId` không tồn tại → pre-check → **404 RESOURCE_NOT_FOUND** (admin thấy mọi team ⇒ thiếu = thật sự không có). deactivate user đã inactive / reactivate user đang active → **idempotent** (lật lại trạng thái, không lỗi).
- Lý do: dùng code registry có sẵn cho edge admin-only ít gặp (P2003 FK safety-net để Bước 7); idempotent an toàn cho thao tác đảo-được. Duyệt qua plan review.

---

### Stats — chỗ §5 im lặng: byAssignee sort + admin-deny + nhóm rỗng (Bước 6)
- Loại: phụ-lục-vĩnh-viễn (sort + edge); admin-deny tái dùng code role-rìa `INSUFFICIENT_ROLE` (xem entry Bước 3 go-live — KHÔNG đẻ code mới)
- Trạng thái: mở (không hạn đóng)
- Vị trí: src/tasks/infrastructure/prisma-task.repository.ts (aggregate — sort `localeCompare`) · src/stats/stats.controller.ts (`@Roles(['LEADER'], forbid)`)
- Hợp đồng nói gì: §5 định shape stats nhưng IM LẶNG: (a) sort mảng `byAssignee`; (b) admin (role≠leader, teamId null) gọi `/stats` ra code/status nào; (c) nhóm rỗng task / toàn member rảnh.
- Quyết định: (a) `byAssignee` sort **name ASC** (khớp tiền lệ roster `GET /teams/:id/members` — cùng là liệt-kê-người-trong-nhóm); (b) admin → **403 `INSUFFICIENT_ROLE`** CÙNG code với member (một `RolesGuard([LEADER])` nhánh `forbid`; admin biết endpoint qua contract ⇒ 403 không lộ thêm; KHÔNG tách admin→404); (c) nhóm rỗng → **200** với byProgress toàn 0, byAssignee các dòng 0 (member rảnh vẫn hiện), total 0, overdue 0 (KHÔNG 404).
- Lý do: một convention sort cho liệt-kê-người; admin-deny ở rìa role-guard (không scoped-load như /tasks) ⇒ 403 đúng "thấy-được↔403", giữ một guard không tách nhánh; stats luôn 200 cho leader (dashboard hợp lệ kể cả rỗng). Duyệt qua plan-mode AskUserQuestion (Luật số 0 — §5 im lặng → hỏi).

---

## Cách thêm entry mới

Mỗi khi `/check-spine` hoặc plan-mode review gặp một chỗ spine để ngỏ và bạn duyệt một giá trị cụ thể, thêm entry vào đây **trước khi commit** — đừng để trôi vào chỉ commit message. Gắn `Loại`:
- **phụ-lục-vĩnh-viễn** nếu hợp đồng im lặng (ở đây mãi).
- **chờ-bổ-sung-spine** nếu là phần FE-observable (code/status/field) — ghi rõ "→ docs/06 §X, Bước N", và khi go-live thì người duyệt amendment vào docs/06 rồi đóng entry. Nếu rủi ro quên cao, **đặt một dòng nhắc trong `CLAUDE.md`** ở bước đó.
