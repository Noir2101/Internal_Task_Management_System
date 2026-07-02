# Giai đoạn 9 — Kế hoạch Frontend (React SPA)

> Hệ thống quản lý công việc nội bộ (Internal Task Management System)
> Tài liệu này là mini-design cho frontend. Nó KHÔNG định nghĩa lại luật nghiệp vụ. Backend (`docs/00–06`,
> đã đông cứng và đã e2e ở `docs/08`) là nguồn sự thật; FE chỉ TIÊU THỤ hợp đồng.
> FE "mỏng có chủ đích" vì đồ án thiên backend (`docs/01 §9` MoSCoW, `NFR-UX`). Như các tài liệu trước, nó
> ghi lý do và đánh đổi cho mỗi quyết định lớn.
> Stack: React, Vite, TypeScript; same-origin với NestJS backend.

---

## Bảng thuật ngữ

| Thuật ngữ | Nghĩa ngắn |
|---|---|
| same-origin | FE và backend phục vụ trên cùng một origin (Vite proxy lúc dev, reverse-proxy lúc prod). Cookie sạch, không CORS. |
| access token in-memory | Access token chỉ giữ trong RAM (biến JS), không localStorage. Reload là mất, phải rehydrate. |
| rehydrate | Sau reload, FE mất access token nên gọi `/auth/refresh` (cookie) rồi `/auth/me` để dựng lại danh tính. |
| interceptor | Bộ chặn request/response của axios. Đính Bearer ở request; lo refresh-retry-once và parse envelope ở response. |
| refresh-retry-once | Gặp 401 do token hết hạn thì refresh MỘT lần rồi thử lại request đúng một lần; fail nữa thì về login. |
| envelope | Khung lỗi JSON thống nhất; FE rẽ nhánh CHỈ trên `code` (`docs/06 §7`). |
| projection | Response là phép chiếu, không phải model. FE nhận đúng field hợp đồng, không hơn. |
| record-level authz | Phân quyền trên từng bản ghi. Backend quyết; FE ẩn/hiện chỉ là UX (SEC-03). |
| two-axis | Task có hai trục độc lập: `progress` (3 giá trị) và cờ `overdue` (suy ra). OVERDUE KHÔNG phải trạng thái thứ tư. |
| seam | Đường cắt để sẵn: một chỗ hoãn được, thêm sau mà không phải mổ lõi. |
| roster | Danh sách thành viên đang hoạt động của một nhóm, dùng cho dropdown giao việc. |

---

## 0. Triết lý: FE là người tiêu thụ hợp đồng

Ba nguyên tắc chi phối mọi quyết định dưới đây.

- **Backend là nguồn sự thật.** Mọi luật nghiệp vụ và phân quyền đã sống ở `docs/00–06` và đã e2e. FE không
  tái phát biểu luật. Ẩn hoặc hiện nút chỉ là UX; quyền thật do backend enforce (SEC-03).
- **Rẽ nhánh trên `code`, không trên `message`.** `docs/06 §7.1` chốt `message` đổi và dịch tự do. FE đọc
  `envelope.code` rồi ánh xạ sang hành vi UI. Mảng `details[]` chỉ có ở `VALIDATION_FAILED`.
- **Không gửi field server-suy-ra.** Backend bật `forbidNonWhitelisted`, nên nhồi field lạ vào body sẽ nhận
  400. `ownerId` lấy từ `sub`; scope và `teamId` lấy từ JWT. Các field này KHÔNG bao giờ nằm trong request.
  Đây là chống mass-assignment (nhồi field trái phép để leo thang quyền) ở phía FE, khớp keystone `docs/06 §3.1`.

---

## 1. Stack — quyết định và lý do

| Trục | Chốt | Lý do và đánh đổi |
|---|---|---|
| Build và lang | Vite, React 18, TypeScript | HMR (hot module replacement) nhanh, config proxy đơn giản, TS khớp enum và DTO backend. |
| UI | MUI (Material UI) | Sẵn nhiều component dựng liền (Table, Dialog, Select, Chip), ít CSS tay, nhanh cho admin CRUD mỏng. Đổi lại bundle nặng hơn shadcn, chấp nhận được cho đồ án. |
| Server state | TanStack Query | Cache theo query-key (khoá định danh cache), refetch và invalidate sau mutation (thao tác ghi), loading và error chuẩn. Khử phần lớn client state thủ công. |
| Client state | React Context (AuthContext) | Chỉ giữ access token (RAM) và identity. Không cần Redux cho một FE mỏng. |
| Form và validation | React Hook Form + Zod | Ít re-render, TS inference tốt; Zod schema mirror DTO (`docs/06 §8.1`); map `details[]` sang field error. |
| Router | React Router | Protected-route và layout route đơn giản, quen thuộc. |
| Charts | Recharts | Dựng bar và pie từ stats shape (`docs/06 §5`) đã chart-ready. Could-have, làm ngay. |
| HTTP | axios (một api-client) | Interceptor ở request đính Bearer; ở response lo refresh-retry-once và parse envelope. `withCredentials` cho cookie `/auth/*`. |

> Nguyên tắc chống over-engineer (nhất quán `docs/04`): không Redux, không SSR, không Next, không state-machine.
> UI đơn giản, rõ ràng hơn hoa mỹ (NFR-UX).

---

## 2. Screen inventory — theo persona và ma trận phân quyền

Nguồn phân quyền: `docs/01 §6` (ma trận) và §3 (personas). FE ẩn hoặc hiện theo role CHỈ cho UX; backend
enforce thật. Cột "Must/Could" theo MoSCoW `docs/01 §9`.

### 2.1. Chung (mọi persona)

| Màn hình | Route | Tiêu thụ | Must/Could |
|---|---|---|---|
| Login | `/login` (public) | `POST /auth/login`, nhận `{accessToken, user}` | Must |
| App shell cộng nav theo role | (layout) | identity từ `/auth/me` | Must |
| 403 / 404 / error boundary | — | rẽ nhánh trên `code` | Must |

### 2.2. Member (`docs/01 §3.3`)

| Màn hình | Route | Tiêu thụ | Must/Could |
|---|---|---|---|
| Task list nhóm (đọc), filter, search, paginate | `/tasks` | `GET /tasks?progress&overdue&assigneeId&q&page&limit` | Must |
| Task detail | `/tasks/:id` | `GET /tasks/:id` | Must |
| Tạo task (tự-giao) | `/tasks/new` | `POST /tasks` (assignee KHOÁ = mình) | Must |
| Sửa hoặc xoá định nghĩa task MÌNH tạo (owner) | `/tasks/:id` (dialog) | `PATCH /tasks/:id`, `DELETE /tasks/:id` | Must |
| Cập nhật tiến độ task được giao (assignee) | `/tasks/:id` | `PATCH /tasks/:id/progress` | Must |
| "Việc của tôi" (personal dashboard) | `/my-tasks` | `TaskList` với `assigneeId=self` | **Could — DEFER** |

### 2.3. Leader (`docs/01 §3.2`)

| Màn hình | Route | Tiêu thụ | Must/Could |
|---|---|---|---|
| Tất cả của Member, cộng: | | | Must |
| Tạo task giao member trong nhóm | `/tasks/new` | `POST /tasks` (assignee = dropdown từ roster) | Must |
| Reassign task | `/tasks/:id` | `PATCH /tasks/:id/assignee` (roster) | Must |
| Dashboard thống kê nhóm (số) | `/dashboard` | `GET /stats` | Must |
| Dashboard, phần charts | `/dashboard` | cùng `GET /stats`, render Recharts | **Could — LÀM NGAY** |

### 2.4. Admin (`docs/01 §3.1`) — KHÔNG chạm task ở luồng thường

> Admin không có nhóm, nên scoped-load chặn admin khỏi `/tasks` và trả 404 (`docs/06 §3.2`). Vì vậy nav ẩn
> Tasks và Dashboard.

| Màn hình | Route | Tiêu thụ | Must/Could |
|---|---|---|---|
| Users: list, filter (role/teamId/includeInactive), paginate | `/admin/users` | `GET /users` | Must |
| Users: tạo (email, name, password, role, teamId?) | `/admin/users/new` | `POST /users` | Must |
| Users: sửa tên | `/admin/users/:id` | `PATCH /users/:id` (chỉ `name`) | Must |
| Users: deactivate (hiện `orphanedTaskCount`), reactivate | `/admin/users` | `POST /users/:id/deactivate` · `/reactivate` | Must |
| Teams: list | `/admin/teams` | `GET /teams` (mảng, không paginate) | Must |
| Teams: tạo, đổi tên | `/admin/teams` | `POST /teams` · `PATCH /teams/:id` | Must |
| Teams: đặt leader (atomic swap) | `/admin/teams/:id` | `PUT /teams/:id/leader` (userId = members) | Must |
| Teams: xem members | `/admin/teams/:id` | `GET /teams/:id/members` | Must |
| Teams: giải thể (break-glass) | `/admin/teams/:id` | `DELETE /teams/:id` (409 `TEAM_NOT_EMPTY`) | Must |

---

## 3. Kiến trúc FE mỏng

### 3.1. Layout thư mục (`/web`)

```
web/
  index.html · vite.config.ts (proxy /api → localhost:3000)
  src/
    main.tsx · App.tsx (router + QueryClientProvider + ThemeProvider)
    lib/
      api-client.ts        axios instance: baseURL '/api/v1', withCredentials, interceptors
      error.ts             ApiError { code, statusCode, details? } + parse envelope
      query-keys.ts        khoá TanStack Query theo resource + filter
    auth/
      AuthContext.tsx      access token (RAM) + identity {id,name,role,teamId}
      useAuth.ts · bootstrap.ts (refresh + me lúc mount)
    routes/
      ProtectedRoute.tsx   cần identity, else → /login
      RoleRoute.tsx        gate UX theo role (không phải bảo mật)
      index.tsx            khai báo route
    features/
      tasks/   (TaskList, TaskDetail, TaskForm, ProgressControl, ReassignControl, filters, hooks)
      stats/   (StatCards, ProgressChart, OverdueSlice, ByAssigneeChart)
      users/   (UserTable, UserForm, DeactivateDialog)
      teams/   (TeamTable, TeamForm, LeaderSwap, DeleteTeamDialog)
    components/  (shared: DataTable, Pagination, OverdueChip, ProgressBadge, ConfirmDialog, ErrorState)
```

### 3.2. api-client — trục nối hợp đồng

- **Base URL tương đối** `/api/v1`. URL tương đối giữ seam cho same-origin và cho việc tách 2 repo (mục 4).
  `withCredentials: true` để cookie refresh gửi kèm khi gọi `/auth/*`.
- **Request interceptor:** đính `Authorization: Bearer <access token trong RAM>` nếu có.
- **Response interceptor**, luật refresh-retry-once (`docs/06 §6.4`): gặp 401 với `TOKEN_EXPIRED` hoặc
  `TOKEN_INVALID` thì gọi `POST /auth/refresh` một lần (gộp trùng nếu nhiều request đồng thời), rồi set
  access token mới, rồi thử lại request gốc đúng một lần. Refresh fail (`SESSION_EXPIRED`) thì clear token
  và về `/login`.
- **Parse envelope thành `ApiError`** `{ code, statusCode, details? }`. Mọi nơi gọi rẽ nhánh trên `code`.

### 3.3. Auth và rehydrate

- Access token CHỈ ở RAM (trong AuthContext), KHÔNG localStorage. Đây là chống XSS (`docs/06 §6.1`).
- **Bootstrap (khởi động) lúc load app:** thử `POST /auth/refresh`. Nếu 200 thì gọi `GET /auth/me`, set
  identity, rồi render app. Nếu 401 thì về `/login`. Đây là cách sống sót qua reload.
- **Login:** `POST /auth/login`, set access token và identity từ `res.user`, rồi điều hướng theo role. Admin
  về `/admin/users`, leader về `/dashboard`, member về `/tasks`.
- **Logout:** `POST /auth/logout` (mang cookie), clear token trong RAM, rồi về `/login`.

### 3.4. Rẽ nhánh lỗi theo `code`

| `code` hoặc tình huống | Xử lý FE |
|---|---|
| `VALIDATION_FAILED` (400) | Đẩy `details[]` lên đúng field form qua RHF `setError`. |
| `PAST_DEADLINE_CONFIRMATION_REQUIRED` (400) | Mở ConfirmDialog "deadline ở quá khứ?"; đồng ý → gửi lại kèm `allowPastDeadline=true`. |
| `INVALID_CREDENTIALS` / `ACCOUNT_DISABLED` (401/403) | Hiện lỗi ở form login (chung, không lộ email tồn tại). |
| `TOKEN_EXPIRED` / `TOKEN_INVALID` (401) | Interceptor lo (refresh-retry-once). |
| `SESSION_EXPIRED` (401) | Clear token → về `/login`. |
| `NOT_TASK_OWNER` / `NOT_TASK_ASSIGNEE` / `TASK_MEMBER_SELF_ASSIGN_ONLY` / `TASK_ASSIGNEE_NOT_IN_TEAM` / `INSUFFICIENT_ROLE` (403) | Toast hoặc inline "bạn không có quyền"; refetch để đồng bộ (race với đổi role hoặc nhóm). |
| `RESOURCE_NOT_FOUND` (404) | View 404 gọn (không lộ tồn tại). |
| `EMAIL_TAKEN` / `TEAM_NAME_TAKEN` / `LEADER_*` / `TEAM_NOT_EMPTY` / `CANNOT_DISABLE_SELF` / `LAST_ADMIN` (409) | Toast hoặc inline theo ngữ cảnh (vd `LEADER_REPLACEMENT_REQUIRED` → gợi ý PUT leader trước). |
| `RATE_LIMITED` (429) | Toast, đọc `Retry-After`, khoá nút tạm. |
| `INTERNAL_ERROR` (500) | ErrorState cộng gợi ý thử lại (kèm `requestId` để báo lỗi). |

### 3.5. Bất biến FE phải giữ (checklist review mỗi slice)

- KHÔNG gửi field server-suy-ra (`ownerId`, scope, `teamId` của task). KHÔNG có param `teamId` ở `GET /tasks`.
- `overdue` render thành **chip riêng**, KHÔNG thành giá trị `progress` thứ tư. Filter dùng hai control tách
  rời: một select cho `progress`, một control ba trạng thái (tri-state: all, overdue, on-time) cho `overdue`.
  Hai control này khớp `?progress=` và `?overdue=`; hai trục kết hợp AND.
- Access token chỉ ở RAM; refresh qua cookie HttpOnly (JS không đọc được).
- Deadline quá khứ: FE xác nhận rồi gửi lại kèm `allowPastDeadline` (rule vẫn ở backend).
- Ẩn hoặc hiện theo role chỉ là UX; mọi thao tác vẫn gọi API và tôn trọng 403 hoặc 404 trả về.
- Enum verbatim (`TODO`, `IN_PROGRESS`, `DONE`; `ADMIN`, `LEADER`, `MEMBER`), không có lớp dịch.

### 3.6. Same-origin (dev và prod)

- **Dev:** `vite.config.ts` proxy `/api` sang `http://localhost:3000` (backend). Browser origin là
  `localhost:5173`. Cookie refresh (`Secure; SameSite=Lax; Path=/api/v1/auth`) vẫn nhận được vì `localhost`
  là secure-context. Có một điểm cần soi ở Slice 1: nếu cookie không persist qua proxy dev, đó là chỗ kiểm
  đầu tiên.
- **Prod:** serve FE build same-origin với API, bằng reverse-proxy hoặc để backend serve static. URL tương
  đối giữ nguyên, nên cookie Path chạy và không dính CORS.

---

## 4. Seam để dành portfolio (khớp lối "đường cắt để sẵn" của `docs/04`)

- **Member "việc của tôi":** `TaskList` nhận prop `lockedFilter`, rồi route `/my-tasks` chỉ mount lại nó với
  `assigneeId=me`. Đây là một seam, thêm sau chừng mười dòng. Stats-cho-member là việc backend, không cản FE.
- **Tách 2 repo cộng reverse-proxy:** api-client dùng URL tương đối qua một module duy nhất. Nhờ vậy tách
  repo chỉ cần đặt nginx hoặc Caddy làm reverse-proxy, route `/api/*` về backend và `/*` về FE. Browser vẫn
  thấy một origin, nên cookie Path vẫn chạy. Khả thi, không phải mổ lại code.

---

## 5. Test — mỏng, khớp thiên-backend

- **Manual smoke** mỗi slice: click-through các luồng chính (login, CRUD task, filter, admin, stats).
- **Thin Playwright happy-path (1–2 luồng):** login, tạo task, đổi progress, logout; tuỳ chọn thêm luồng
  leader xem dashboard. Đây là tín hiệu portfolio, không phải lưới đầy đủ (backend đã có 42 e2e ở `docs/08`).
- KHÔNG đặt coverage-gate FE (nhất quán `docs/08 §7`).

---

## 6. Chia slice (build sau plan này)

1. **Slice 1 — Walking skeleton cộng Auth (keystone-first):** Vite scaffold (dựng khung), MUI theme, router,
   api-client (interceptor refresh-retry-once), AuthContext cộng bootstrap (`refresh` rồi `me`), `/login`,
   ProtectedRoute, app shell cộng nav theo role, xử lý envelope theo `code`. Cổng: đăng nhập 3 role, reload
   rehydrate, logout.
2. **Slice 2 — Tasks:** list cộng filter (progress, overdue, assignee) cộng search cộng paginate; detail;
   create và edit (RHF+Zod, past-deadline confirm); progress (assignee); reassign (leader). Cổng: two-axis
   đúng, không gửi field cấm, 403 và 404 đúng UX.
3. **Slice 3 — Admin cộng Stats:** users CRUD cộng deactivate/reactivate (`orphanedTaskCount`, các 409); teams
   CRUD cộng leader-swap cộng roster cộng break-glass; leader dashboard số cộng charts (Recharts). Cổng: chặn
   mass-assignment ở form, OVERDUE không thành bucket thứ tư trên chart.

Mỗi slice một phiên riêng: plan-mode, execute, test-as-you-go, rồi `/ship` (nhãn "phase 9").

---

## 7. Truy vết yêu cầu sang màn hình

| Yêu cầu hoặc hợp đồng | Màn hình FE |
|---|---|
| FR-AUTH-02/03/04, `docs/06 §6` | Login, bootstrap rehydrate, logout, interceptor refresh-retry-once |
| FR-TASK-01, `POST /tasks` | Task create (member tự-giao / leader roster; past-deadline confirm) |
| FR-TASK-02, `/progress` | ProgressControl (assignee) |
| FR-TASK-03, `PATCH` và `DELETE /:id` | TaskForm edit cộng delete (owner) |
| FR-TASK-04, `GET /tasks` | TaskList cộng filter/search/paginate; IDOR → 404 view |
| FR-TASK-05, `overdue` | OverdueChip cộng overdue tri-state filter (hai trục) |
| FR-USER-01/02, `docs/06 §9` | Admin users cộng teams (deactivate, leader-swap, break-glass) |
| FR-DASH-01, `GET /stats` | Leader dashboard: StatCards cộng charts (3 bucket + overdue cross-cut + byAssignee) |
| SEC-03 | Ẩn hoặc hiện role = UX; API luôn enforce |
| UX-01/02 | Error UX theo `code`; UI đơn giản |
| DOC-01 | (tham chiếu) Swagger `/api/v1/docs` để đối chiếu shape |

---

## 8. Bàn giao cho các slice build

Tài liệu này là mini-design đông cứng cho FE. Các slice sau chỉ hiện thực phần đã trỏ tên. Chúng KHÔNG phát
minh hợp đồng mới và KHÔNG sửa backend. Khi FE lòi ra chỗ hợp đồng chưa nói, DỪNG và hỏi người (Luật số 0).
