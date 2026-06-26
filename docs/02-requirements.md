# Giai đoạn 2 — Yêu cầu chức năng & phi chức năng

> Hệ thống quản lý công việc nội bộ
> Tài liệu này biến các user story (Giai đoạn 1) thành **yêu cầu kiểm chứng được**. Nguyên tắc xuyên suốt: mỗi yêu cầu phải trả lời được câu hỏi *"làm sao biết nó đã đạt?"*.

---

## Cách đọc tài liệu này

**Yêu cầu chức năng (FR – Functional Requirement):** *hệ thống làm gì*. Mỗi FR quan trọng kèm **acceptance criteria** viết theo BDD:
- **Given** (bối cảnh ban đầu) — **When** (hành động xảy ra) — **Then** (kết quả mong đợi).
- Luôn cố gắng nêu cả **happy path** (thành công) lẫn **nhánh lỗi** (failure mode). Phần lớn bug nằm ở nhánh lỗi mà lúc thiết kế không ai nghĩ tới.

**Yêu cầu phi chức năng (NFR – Non-Functional Requirement):** *hệ thống tốt thế nào* — bảo mật, hiệu năng, bảo trì... Mỗi NFR gắn một **con số hoặc tiêu chuẩn cụ thể** thay vì tính từ chung chung.

> Quy ước phạm vi: acceptance criteria được viết kỹ cho các chỗ **có logic nghiệp vụ đáng chú ý** (phân quyền, hai trục trạng thái, quy tắc giao việc). CRUD tầm thường ghi gọn.

---

## PHẦN A — YÊU CẦU CHỨC NĂNG

### Nhóm FR-AUTH — Xác thực & phiên đăng nhập

**FR-AUTH-01 — Đăng ký / tạo tài khoản**
Tài khoản do **admin** tạo (mô hình nội bộ doanh nghiệp, không tự đăng ký công khai). Admin đặt email, mật khẩu tạm, vai trò, nhóm.

**FR-AUTH-02 — Đăng nhập**
```
Given  một tài khoản hợp lệ đang hoạt động
When   người dùng đăng nhập đúng email + mật khẩu
Then   hệ thống trả về access token (sống ngắn) + refresh token (sống dài)

Given  một tài khoản
When   người dùng nhập sai mật khẩu
Then   hệ thống trả lỗi 401 với thông báo chung ("email hoặc mật khẩu không đúng"),
       KHÔNG tiết lộ email có tồn tại hay không (tránh lộ thông tin)

Given  một tài khoản đã bị khoá
When   người dùng đăng nhập đúng thông tin
Then   hệ thống từ chối với lỗi rõ ràng là tài khoản bị vô hiệu hoá
```

**FR-AUTH-03 — Làm mới token (refresh + rotation)**
```
Given  một refresh token còn hiệu lực và chưa bị thu hồi
When   client gọi endpoint refresh
Then   hệ thống cấp access token mới VÀ một refresh token mới (rotation),
       đồng thời vô hiệu refresh token vừa dùng

Given  một refresh token đã bị thu hồi (đã logout / đã bị xoay vòng) hoặc đã hết hạn
When   client gọi endpoint refresh
Then   hệ thống từ chối (401) và buộc đăng nhập lại
```
> Đã chốt: **rotation** trong phạm vi bản nộp (tín hiệu bảo mật tốt, rẻ vì refresh token đã lưu server). **Reuse-detection** (trình lại token đã-dùng ⇒ thu hồi cả "họ" token) thuộc **Should-have** — rotation một mình chưa cho lợi ích bảo mật chính.

**FR-AUTH-04 — Đăng xuất**
```
Given  một người dùng đang đăng nhập
When   người dùng đăng xuất
Then   refresh token tương ứng bị thu hồi (xoá khỏi server),
       các access token cũ tự hết hiệu lực khi hết hạn (≤ thời gian sống access token)
```

---

### Nhóm FR-USER — Quản lý người dùng & tổ chức (Admin)

**FR-USER-01 — CRUD người dùng** (admin): tạo, xem, sửa, vô hiệu hoá tài khoản.
> Lưu ý: ưu tiên **vô hiệu hoá (soft delete)** thay vì xoá cứng, để giữ lịch sử task đã giao. Xoá cứng một user còn task đang giao sẽ phá vỡ toàn vẹn dữ liệu.
```
Given  một leader đang là leader hoạt động của nhóm X
When   admin cố vô hiệu hoá leader đó mà CHƯA chỉ định leader thay
Then   hệ thống từ chối: leader là vị trí cấu trúc, phải có người thay trước (bất biến cứng)

Given  một member của nhóm X còn task treo
When   admin vô hiệu hoá member đó
Then   cho phép; hệ thống báo leader nhóm X số task còn treo;
       task vẫn nằm trong phạm vi nhóm (assignee_id được giữ; scope suy ra qua assignee.team_id — Task không có cột team_id, xem Phần D), leader reassign trong nhóm
```

**FR-USER-02 — Gán nhóm & vai trò** (admin): gán user vào một nhóm, đặt vai trò tổ chức (leader / member).
```
Given  một nhóm đã có leader
When   admin gán thêm một user làm leader cho cùng nhóm đó
Then   hệ thống từ chối / yêu cầu thay leader: MỖI NHÓM CHỈ CÓ MỘT LEADER (đã chốt)
```
> Giả định đã chốt: **mỗi leader/member thuộc đúng một nhóm** (quan hệ một-nhiều); admin không thuộc nhóm nào. "Task của nhóm tôi" do đó là một tập rõ ràng, không nhập nhằng.

---

### Nhóm FR-TASK — Quản lý công việc (lõi hệ thống)

**FR-TASK-01 — Tạo task**
```
Given  một leader của nhóm X
When   leader tạo task và giao cho một member thuộc nhóm X
Then   task được tạo với owner = leader, assignee = member đó, progress = TODO

Given  một member của nhóm X
When   member tạo task
Then   task được tạo với owner = member, assignee BẮT BUỘC = chính member đó
       (member chỉ tự-giao cho mình, không giao cho người khác)

Given  một leader của nhóm X
When   leader cố giao task cho một người KHÔNG thuộc nhóm X
Then   hệ thống từ chối (403): chỉ giao được trong phạm vi nhóm mình

Given  bất kỳ ai
When   tạo task thiếu trường bắt buộc (tiêu đề)
Then   hệ thống từ chối (400) với thông báo validation rõ ràng từng trường

Given  bất kỳ ai tạo task với deadline ở quá khứ, KHÔNG kèm cờ xác nhận
When   gửi yêu cầu tạo
Then   hệ thống từ chối (400): nghi gõ nhầm — yêu cầu xác nhận

Given  bất kỳ ai tạo task với deadline ở quá khứ, CÓ cờ `allowPastDeadline=true`
When   gửi yêu cầu tạo
Then   cho phép tạo (chủ đích log một việc đã trễ); task hiển thị OVERDUE ngay (xem FR-TASK-05)
```
> Lý do: hệ thống không tự phân biệt được "cố ý log việc đã trễ" với "gõ nhầm deadline", nên không chặn cứng mà **bắt xác nhận tường minh**: frontend hỏi người dùng rồi gửi kèm cờ `allowPastDeadline`. Cờ nằm ở payload để **backend vẫn là nơi validate** (không để rule chỉ nằm ở frontend — tôn trọng SEC-03). Deadline quá khứ không phải lỗi toàn vẹn: task tạo ra đã trễ thì *đúng là* OVERDUE.
> Ghi chú nghiệp vụ: member tạo task cho chính mình phản ánh nhu cầu **ghi nhận việc tự phát / minh bạch**; phân biệt với **quyền điều phối người khác** (chỉ leader có). Task member tự tạo VẪN hiển thị trong view của leader.

**FR-TASK-02 — Cập nhật tiến độ (progress)**
```
Given  một task được giao cho member M
When   M cập nhật tiến độ (TODO → IN_PROGRESS → DONE)
Then   hệ thống lưu trạng thái mới

Given  một task được giao cho member M
When   một member KHÁC cố cập nhật tiến độ task đó
Then   hệ thống từ chối (403): chỉ assignee mới cập nhật được tiến độ việc của mình
```

**FR-TASK-03 — Sửa / xoá định nghĩa task (ownership ≠ assignment)**
```
Given  một task có owner = leader, assignee = member M
When   member M cố sửa tiêu đề / deadline / đổi người được giao
Then   hệ thống từ chối (403): assignee chỉ được đổi tiến độ, KHÔNG sửa định nghĩa

Given  một task có owner = leader L
When   leader L sửa/xoá định nghĩa task
Then   cho phép

Given  một task do admin/cấp trên giao xuống cho leader L
When   leader L cố xoá task đó
Then   hệ thống từ chối: chỉ owner (người giao) mới xoá được định nghĩa
```

**FR-TASK-04 — Danh sách, tìm kiếm, lọc**
```
Given  một leader của nhóm X
When   leader xem danh sách task
Then   thấy mọi task trong nhóm X (của tất cả member), kèm progress + tình trạng hạn

Given  một member của nhóm X
When   member xem danh sách task
Then   thấy mọi task trong nhóm X (đọc), nhưng chỉ task của mình mới sửa được tiến độ

Given  một leader đang xem danh sách
When   leader lọc theo trạng thái (progress) và/hoặc người phụ trách
Then   hệ thống trả đúng tập task khớp bộ lọc

Given  một leader của nhóm X
When   leader cố truy cập task của nhóm Y (qua sửa URL/ID)
Then   hệ thống từ chối (403/404): không rò rỉ dữ liệu nhóm khác
```
> Lưu ý bảo mật: kiểm tra phân quyền theo **bản ghi cụ thể** (record-level), không chỉ theo role. Một leader có role hợp lệ vẫn không được xem task nhóm khác. Đây là lỗi (IDOR) rất hay gặp — kiểm ở backend, không tin client.
> Tìm kiếm cơ bản: tìm trên **tiêu đề + mô tả**, khớp một phần không phân biệt hoa thường (`ILIKE`). Nâng cấp full-text (`pg_trgm`/tsvector) để dành portfolio — chỉ đổi cách build mệnh đề truy vấn.
> Tầng truy vấn: lọc (gồm lọc theo OVERDUE — xem FR-TASK-05) + phân trang phải thực hiện **ở tầng DB**, tổ hợp được, *không* fetch hết rồi lọc/cắt trang trong bộ nhớ.

**FR-TASK-05 — Tình trạng hạn (due status) suy ra tự động**
```
Given  một task có deadline đã qua và progress != DONE
When   bất kỳ ai xem task/danh sách
Then   task hiển thị tình trạng = OVERDUE (suy ra lúc đọc: deadline < now AND progress != DONE)

Given  một task có deadline đã qua nhưng progress == DONE
When   xem task
Then   task KHÔNG bị đánh OVERDUE (đã hoàn thành thì không còn "quá hạn")

Given  một task đang IN_PROGRESS và đã quá deadline
When   leader xem danh sách
Then   task hiển thị đồng thời "Đang xử lý" + "Quá hạn" (hai trục độc lập)
```
> Hiện thực: "suy ra lúc đọc" nghĩa là một **predicate biểu diễn được trong SQL** (`deadline < now() AND progress != 'DONE'`), không phải tính trong code sau khi fetch. Bắt buộc vậy để lọc + phân trang theo OVERDUE chạy ở tầng DB (xem FR-TASK-04, NFR-PERF).

---

### Nhóm FR-DASH — Dashboard thống kê

**FR-DASH-01 — Thống kê theo trạng thái & người phụ trách**
```
Given  một leader của nhóm X
When   leader mở dashboard
Then   thấy số liệu nhóm X gồm HAI lát độc lập (đúng mô hình hai trục, Giai đoạn 1 §4):
       (1) phân bố theo TRỤC TIẾN ĐỘ — 3 bucket loại trừ nhau: TODO / IN_PROGRESS / DONE
       (2) một LÁT CẮT OVERDUE riêng — đếm task quá hạn (theo định nghĩa là tập con của
           TODO+IN_PROGRESS), KHÔNG gộp OVERDUE thành bucket thứ tư ngang hàng
       và phân rã theo từng người phụ trách

Given  một leader của nhóm X
When   leader mở dashboard
Then   số liệu CHỈ tính trong phạm vi nhóm X (không lẫn nhóm khác)
```
> Ghi chú: OVERDUE **không** phải bucket thứ tư ngang hàng TODO/IN_PROGRESS/DONE — gộp như vậy sẽ đếm trùng task IN_PROGRESS+OVERDUE hoặc làm mất thông tin tiến độ (đúng cảnh báo ở Giai đoạn 1 §0.4/§4.3). Vì thế dashboard tách hai lát: phân bố tiến độ (3 bucket) + lát cắt OVERDUE (cross-cut). Cấu trúc số liệu này cũng sẵn sàng cho chart (điểm cộng).

---

## PHẦN B — YÊU CẦU PHI CHỨC NĂNG

> Con số đặt ở mức **hợp lý cho đồ án quy mô nhỏ** — đủ thực tế để bảo vệ, không phóng đại. Mục tiêu là chứng minh *biết cách đặt tiêu chí đo được*, không phải mô phỏng hệ thống triệu người dùng.

### NFR-SEC — Bảo mật (ưu tiên cao nhất với định hướng backend)
- **SEC-01:** Mật khẩu lưu dưới dạng **hash + salt** bằng bcrypt/argon2. Không bao giờ lưu/log mật khẩu thô.
- **SEC-02:** Access token sống ngắn (đề xuất **15 phút**); refresh token sống dài (đề xuất **7 ngày**), lưu phía server để thu hồi được, **có rotation** (mỗi lần refresh phát token mới + vô hiệu token cũ — FR-AUTH-03). Store refresh token **phải dùng chung** (DB/Redis), không in-memory per-instance, để chạy nhiều instance không vỡ ("stateless" = không session dính-instance, không phải không-có-state-server). **Reuse-detection** (trình token đã-dùng ⇒ thu hồi cả "họ" token) thuộc Should-have — rotation một mình chỉ rút ngắn vòng đời token trộm; lợi ích bảo mật chính cần reuse-detection.
- **SEC-03:** Mọi kiểm tra phân quyền thực hiện ở **backend** (guard), không dựa vào việc ẩn/hiện nút ở frontend.
- **SEC-04:** Phân quyền kiểm ở **mức bản ghi** (record-level), chống IDOR — xem FR-TASK-04.
- **SEC-05:** Input được **validate** ở backend (kiểu, độ dài, định dạng) trước khi chạm DB.
- **SEC-06:** Dùng **truy vấn tham số hoá / ORM** để chống SQL injection (không nối chuỗi SQL).

### NFR-PERF — Hiệu năng & quy mô (mức đồ án)
- **PERF-01:** Hệ thống vận hành đúng với quy mô tham chiếu: **~50 user, ~10 nhóm, ~5.000 task**.
- **PERF-02:** Danh sách task (có phân trang) trả về trong **< 1 giây** ở quy mô PERF-01.
- **PERF-03:** Danh sách dài **bắt buộc phân trang** (đề xuất 20 item/trang) — không trả toàn bộ bảng.
- **PERF-04:** Các cột dùng để lọc/tìm thường xuyên (assignee, trạng thái, nhóm, deadline) có **index** phù hợp.

### NFR-MAINT — Khả năng bảo trì
- **MAINT-01:** Kiến trúc module hoá theo bounded context (Auth, Users/Org, Tasks, Stats).
- **MAINT-02:** Tách tầng rõ ràng: controller (HTTP) / service (nghiệp vụ) / repository (dữ liệu).
- **MAINT-03:** Cấu hình (DB, secret, thời gian sống token) qua **biến môi trường**, không hard-code, không commit secret.
- **MAINT-04:** Quy ước code nhất quán (linter/formatter).
- **MAINT-05:** Audit log đầy đủ — ghi "ai đổi gì, khi nào" cho mọi thao tác, truy vấn được, làm bằng interceptor tập trung (cross-cutting concern) — **KHÔNG thuộc bản nộp**, để dành portfolio. Phân biệt: thao tác break-glass hiếm của admin chỉ ghi bằng **log ứng dụng thông thường** (stdout/Docker logs), không phải tính năng audit log nên không mâu thuẫn với mục này.

### NFR-DOC — Tài liệu hoá
- **DOC-01:** API mô tả đầy đủ bằng **OpenAPI/Swagger**, sinh từ code, truy cập được khi chạy.
- **DOC-02:** README hướng dẫn chạy dự án bằng **một lệnh Docker Compose**.
- **DOC-03:** Tài liệu kỹ thuật ngắn: kiến trúc, schema, các quyết định thiết kế chính (link tới docs Giai đoạn 1–2).

### NFR-DEPLOY — Triển khai
- **DEPLOY-01:** Toàn bộ hệ thống (backend + DB, và frontend nếu có) chạy bằng **Docker Compose** với cấu hình tối thiểu.
- **DEPLOY-02:** Dữ liệu DB **bền vững** qua volume (không mất khi restart container).
- **DEPLOY-03:** Có cơ chế khởi tạo dữ liệu mẫu (seed) để chấm/demo nhanh: ít nhất 1 admin, vài nhóm, vài task.

### NFR-UX — Trải nghiệm (mức tối giản, phù hợp định hướng backend)
- **UX-01:** Thông báo lỗi rõ ràng, hướng người dùng (không phơi stack trace ra UI).
- **UX-02:** Giao diện đủ rõ để hoàn thành các luồng chính mà không cần hướng dẫn.

---

## PHẦN C — Bảng truy vết yêu cầu → nguồn

| Yêu cầu | Bắt nguồn từ |
|---|---|
| FR-AUTH-* | NFR bảo mật + mục tiêu "hiểu bản chất auth" |
| FR-USER-* | Đề: "quản lý người dùng theo role"; Giai đoạn 1 §2, §6 |
| FR-TASK-01..03 | Đề: tạo/giao việc; Giai đoạn 1 §5 (ownership≠assignment) |
| FR-TASK-04 | Đề: tìm kiếm/lọc; Giai đoạn 1 §5.3 (visibility) |
| FR-TASK-05 | Giai đoạn 1 §4 (hai trục trạng thái) |
| FR-DASH-01 | Đề: dashboard thống kê; Giai đoạn 1 §4 (hai trục trạng thái) |
| NFR-SEC-* | Giai đoạn 1 §8; mục tiêu production-grade |
| Ràng buộc tổ chức (1 leader/nhóm, 1 nhóm/user) | Quyết định thiết kế — Giai đoạn 1 §2.1 |
| Rotation refresh token (FR-AUTH-03, SEC-02) | NFR bảo mật; mục tiêu production-grade |
| Deadline quá khứ có cờ xác nhận (FR-TASK-01) | Giai đoạn 1 §4 (OVERDUE); SEC-03 (validate ở backend) |
| Bất biến soft-delete (FR-USER-01) | Giai đoạn 1 §5.4 |
| Break-glass admin | Giai đoạn 1 §2.2 |
| Phạm vi task = nhóm assignee (suy ra) | Giai đoạn 1 §5.2 |

---

## PHẦN D — Hệ quả cho schema (Giai đoạn 5)

Từ các ràng buộc đã chốt:
- **User n—1 Team**, nhưng quan hệ này CÓ THỂ RỖNG với admin: leader/member thuộc đúng
  một nhóm; admin không thuộc nhóm nào (đứng ngoài cây tổ chức). → cột team_id trên User
  là nullable, chỉ bắt buộc với leader/member.
- **Team 1—1 leader, biểu diễn bằng *derive* (không denormalize):** leadership = User có
  `role=LEADER` và `team_id=X`. **KHÔNG** cột `leader_id` trên Team. "Đúng ≤1 leader/nhóm"
  enforce ở DB bằng **partial unique index** `User(team_id) WHERE role='LEADER'`; "≥1 leader
  (trạng thái thường)" là bất biến **domain** (thay-leader atomic: demote cũ + promote mới).
  *Lý do (chốt ở Giai đoạn 5):* nhất quán với "scope Task suy ra qua assignee" — cùng nguyên
  tắc một-nguồn-sự-thật, khử redundancy `leader_id`↔`role`, và khử vòng tham chiếu User↔Team.
  → **Ghi đè** phương án "tham chiếu leader trên bảng Team" nêu ở bản nháp trước.
- **Task n—1 assignee** và **Task n—1 owner** (đều trỏ tới User) → tách rõ người giao và người làm.
- **Phạm vi nhóm của Task = suy ra qua `assignee.team_id`, KHÔNG thêm cột `team_id` trên Task.** Một nguồn sự thật, không lo lệch khi reassign (reassign luôn trong nhóm).
- **Không có bảng `audit_logs`** ở bản nộp. Thao tác break-glass của admin chỉ ghi bằng log ứng dụng, không cần bảng riêng (xem MAINT-05).
- **Phạm vi task luôn xác định, không có task "không nhóm":** vì admin không tạo task ở luồng thường, mọi task đều có assignee là leader/member ⇒ phạm vi suy ra qua assignee. Thao tác break-glass của admin giữ nguyên assignee/team hiện có của task, không sinh task không thuộc nhóm nào.