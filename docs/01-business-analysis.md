# Giai đoạn 1 — Phân tích nghiệp vụ & người dùng

> Hệ thống quản lý công việc nội bộ (Internal Task Management System)
> Tài liệu này ghi lại các **quyết định nghiệp vụ** và **lý do** đằng sau chúng. Mọi quyết định về kiến trúc, schema và API ở các giai đoạn sau đều truy ngược về được tài liệu này.

---

## Bảng thuật ngữ

Bảng này neo nghĩa các thuật ngữ lặp lại. Thân bài sau đó dùng thẳng từ tiếng Anh.

| Thuật ngữ | Nghĩa ngắn |
|---|---|
| Nhóm (Team) | Đơn vị tổ chức nhỏ nhất ở bản v1. Gồm một leader và nhiều member. |
| leader | Vị trí tổ chức đứng đầu một nhóm. Quản và thấy toàn bộ việc trong nhóm. |
| member | Thành viên thường của một nhóm. Làm việc của mình, thấy việc trong nhóm. |
| admin | Vai trò kỹ thuật, quản nền tảng. Đứng ngoài cây tổ chức, không tham gia luồng task thường. |
| role chức năng | Trục phân quyền theo quyền trên nền tảng. Ở bản v1 chỉ có admin. |
| vị trí tổ chức | Trục phân quyền theo chỗ đứng trong cây. Gồm leader và member. |
| ownership | Quyền sở hữu định nghĩa một task. Thuộc về owner, tức người tạo. |
| assignment | Quyền làm và cập nhật tiến độ một task. Thuộc về assignee. |
| owner | Người tạo task, giữ ownership. |
| assignee | Người được giao task, giữ assignment. |
| tiến độ (progress) | Trục trạng thái do người dùng điều khiển. Gồm TODO, IN_PROGRESS, DONE. |
| tình trạng hạn | Trục trạng thái do hệ thống suy ra. Còn hạn hoặc quá hạn (OVERDUE). |
| xoá mềm (soft-delete) | Vô hiệu hoá bản ghi thay vì xoá thật, để giữ lịch sử. |
| break-glass | Nhánh cứu hộ khẩn cấp của admin. Nằm ngoài luồng thường và có ghi log. |
| JWT | Chuẩn token xác thực. Ở đây gồm access token ngắn và refresh token dài. |
| rotation | Mỗi lần refresh thì phát token mới và vô hiệu token cũ. |
| reuse-detection | Phát hiện một token đã dùng bị trình lại, rồi thu hồi cả họ token. |

---

## 0. Bóc tách yêu cầu & ràng buộc

### 0.1. Yêu cầu bắt buộc
- CRUD công việc, người dùng; phân quyền cơ bản theo role.
- Giao việc, theo dõi tiến độ, cập nhật trạng thái.
- Dashboard thống kê theo trạng thái hoặc người phụ trách.
- Đóng gói và triển khai bằng Docker hoặc Docker Compose.
- CSDL quan hệ, dùng PostgreSQL hoặc MySQL.
- API document bằng Swagger hoặc OpenAPI.
- Giao diện đơn giản, dễ dùng.
- Tài liệu kỹ thuật ngắn gọn.

### 0.2. Tính năng mở rộng
- Gửi email hoặc thông báo khi được giao việc.
- Phân trang, tìm kiếm, lọc nâng cao.
- Biểu đồ thống kê.

### 0.3. Mục tiêu cá nhân (định hình mọi quyết định)
- Ưu tiên **best practice và production-grade** hơn là "đủ chạy", vì đích đến là **portfolio xin việc backend**.
- Stack là **NestJS + React**, thiên backend.
- Thời gian làm bản v1 khoảng 3 tuần. Có thể nâng cấp sau cho portfolio.

### 0.4. Phát hiện khi phân tích yêu cầu (điểm cần lập luận rõ)
Đề liệt kê bốn "trạng thái" là Tạo mới, Đang xử lý, Hoàn thành, và Quá hạn. Trên thực tế "Quá hạn" không cùng loại với ba cái còn lại. Ba cái đầu là tiến độ do người dùng điều khiển. Còn "Quá hạn" là tình trạng hạn do hệ thống suy ra. Việc tách hai khái niệm này, trình bày ở mục 4, là một quyết định thiết kế có chủ đích.

---

## 1. Problem statement

Các nhóm trong doanh nghiệp cần một nơi tập trung để **giao việc, theo dõi tiến độ, và biết ai đang chịu trách nhiệm việc gì**. Khi quản lý bằng công cụ rời rạc như chat hay bảng tính, trách nhiệm dễ nhập nhằng. Tình trạng quá hạn không được phát hiện kịp. Cấp quản lý cũng thiếu cái nhìn tổng quan để đốc thúc và hỗ trợ.

Hệ thống này mô phỏng quy trình quản lý task nội bộ. Nó cho phép phân công rõ ràng theo cấu trúc tổ chức. Nó theo dõi đồng thời hai thứ là tiến độ và tình trạng hạn. Nó cung cấp thống kê cho cấp quản lý. Phân quyền phản ánh đúng vị trí của mỗi người trong tổ chức.

---

## 2. Mô hình tổ chức & hai trục phân quyền

### 2.1. Phạm vi bản v1: cây tổ chức 2 tầng
Cấu trúc là **Nhóm (Team) gồm nhiều Thành viên (Member)**. Một nhóm có một leader và nhiều member.

Cây đầy đủ ba tầng Công ty, Phòng, Nhóm được thiết kế để mở rộng sau cho bản portfolio. Rút gọn còn hai tầng ở bản v1 là quyết định có chủ đích, để kiểm soát độ phức tạp phân quyền trong thời gian cho phép.

Hai ràng buộc đã chốt, và chúng định hình schema:
- **Mỗi nhóm có đúng một leader.**
- **Mỗi user thuộc đúng một nhóm.** Đây là quan hệ một-nhiều, không phải nhiều-nhiều. Nó giữ cho phạm vi "task của nhóm tôi" rõ ràng, không nhập nhằng.

### 2.2. Hai trục phân quyền (quyết định thiết kế cốt lõi)
Hệ thống tách bạch hai khái niệm thường bị gộp nhầm.

| Trục | Là gì | Trả lời câu hỏi | Giá trị |
|---|---|---|---|
| **Chức năng (functional role)** | Quyền trên nền tảng | Được phép thao tác *gì*? | `admin` |
| **Tổ chức (organizational position)** | Vị trí trong cây tổ chức | Quản và thấy *phạm vi nào*? | `leader`, `member` |

- **Admin** là vai trò kỹ thuật và nền tảng. Admin quản tài khoản, phân quyền, và vận hành hệ thống. **Admin không tham gia luồng công việc bình thường.** Admin không tạo, giao, sửa, hay xoá task như một manager. Admin đứng ngoài cây tổ chức, tức không thuộc nhóm nào.
- **Leader và member** là vị trí tổ chức. Quyền của họ phái sinh từ vị trí trong cây. Leader quản nhóm mình. Member làm việc của mình.

**Lý do tách, và đây là anti-pattern nếu gộp.** Người quản trị hệ thống, tức IT, và người quản lý công việc kinh doanh trong thực tế thường là hai người khác nhau. Gộp `admin = manager` làm nhập nhằng trách nhiệm và khó mở rộng. Tách ra cũng giúp diễn đạt phân quyền gọn gàng và dễ bảo vệ.

> **Break-glass.** Admin vẫn có thể thao tác trên task, nhưng chỉ qua một nhánh cứu hộ tách bạch. Các ca dùng nhánh này gồm sửa dữ liệu hỏng, xử lý nhóm tạm thời không có leader hoạt động, và giải thể nhóm. Đây không phải luồng thường, và nó không biến admin thành super-manager ngầm. Ca "member bị vô hiệu hoá còn task treo" không dùng break-glass. Trong ca đó leader reassign trong nhóm, vì xoá mềm giữ task trong phạm vi nhóm, xem mục 5.4. Thao tác break-glass được ghi lại bằng log ứng dụng thông thường. Đây không phải tính năng audit log, xem mục 9. Mục đích là dễ truy vết mà vẫn giữ mô hình hai trục.

---

## 3. User personas

### 3.1. Admin (quản trị hệ thống)
- **Mục tiêu:** giữ hệ thống vận hành đúng. Gồm tạo và khoá tài khoản, gán người vào nhóm, gán vai trò.
- **Quan tâm:** tính toàn vẹn dữ liệu và phân quyền đúng. Admin không tham gia điều phối hay nội dung task. Admin chỉ chạm vào task qua nhánh break-glass khi cần cứu hộ, xem mục 2.2.
- **Rành công nghệ:** cao.

### 3.2. Leader (trưởng nhóm)
- **Mục tiêu:** chia việc cho member, theo dõi tiến độ cả nhóm, phát hiện việc trễ để đốc thúc và hỗ trợ.
- **Quan tâm:** bức tranh tổng thể của *nhóm mình*, và ai đang quá tải hoặc trễ hạn.
- **Rành công nghệ:** trung bình.

### 3.3. Member (thành viên)
- **Mục tiêu:** biết mình phải làm gì, cập nhật tiến độ, không bỏ sót deadline.
- **Quan tâm:** danh sách việc *của mình*, và nắm được nhóm đang làm gì. Đây là sự minh bạch trong phạm vi nhóm.
- **Rành công nghệ:** trung bình.

---

## 4. Vòng đời công việc — hai trục trạng thái

Một task được mô tả bằng **hai trục độc lập**.

### 4.1. Trạng thái tiến độ (progress) — do người dùng điều khiển
```
Tạo mới (TODO) → Đang xử lý (IN_PROGRESS) → Hoàn thành (DONE)
```

### 4.2. Tình trạng hạn (due status) — do hệ thống suy ra
```
Còn hạn (ON_TIME)  |  Quá hạn (OVERDUE)
```
Quy tắc suy ra: nếu `deadline < now() AND progress != DONE` thì task là **OVERDUE**.

### 4.3. Vì sao tách hai trục
Một việc có thể đồng thời **"Đang xử lý" và "Quá hạn"**. Leader cần biết việc đó chưa xong dù đã trễ, để hỗ trợ. Nếu nhồi "Quá hạn" chung vào trục tiến độ, ta mất thông tin việc đã làm tới đâu.

### 4.4. Lưu ý hiện thực (sẽ chi tiết ở giai đoạn schema và API)
Ở đây cần phân biệt hai mức của một quyết định. Một thứ "gắn ở rìa" thì hoãn được, thêm sau mà không sửa lõi. Một thứ "ăn vào lõi" thì phải đúng từ đầu.

- Tình trạng quá hạn không lưu cứng thành cột rồi quên cập nhật.
- Bản v1 suy ra lúc đọc. Chính xác là một predicate biểu diễn được trong SQL, dạng `deadline < now() AND progress != 'DONE'`. Nó không tính trong code sau khi đã fetch row. Lý do là hệ thống có lọc theo tình trạng hạn cộng phân trang. Nếu tính OVERDUE trong bộ nhớ sau khi fetch thì không thể lọc và phân trang theo OVERDUE ở tầng DB, vì phải kéo cả bảng về. Đây là quyết định ăn vào lõi tầng truy vấn, không phải chi tiết cài đặt phụ.
- Nâng cấp cho portfolio là một job định kỳ đánh dấu, phục vụ gửi thông báo đúng thời điểm vừa quá hạn.

---

## 5. Quy tắc giao việc & quyền sở hữu

### 5.1. Ownership tách khỏi assignment (quyết định cốt lõi)
- **Owner, tức người giao và là creator:** có quyền **sửa và xoá định nghĩa** task.
- **Assignee, tức người làm:** có quyền **cập nhật tiến độ** task của mình. Assignee không sửa hay xoá định nghĩa task do người khác giao.

Quy tắc này khái quát mọi trường hợp bằng *một* nguyên tắc, không cần case riêng. Nó áp cho cả ca leader giao cho member và ca admin giao cho leader. Hệ quả là **việc cấp trên giao xuống thì cấp dưới không tự xoá được**.

### 5.2. "Giao cho nhóm" được quy về một cá nhân chịu trách nhiệm
- Một task **luôn có đúng một assignee là cá nhân**, tức một single accountable owner.
- "Giao cho nhóm" nghĩa là task thuộc về **leader của nhóm đó**. Leader phân rã và giao lại cho member.
- **Lý do:** giữ mô hình trách nhiệm rõ ràng, vì "việc của cả nhóm là việc của không ai" là phản mẫu. Lý do thứ hai là giữ schema đơn giản, vì chỉ cần `assignee_id`, không cần quan hệ many-to-many giữa task và user.
- **Phạm vi nhóm của task bằng nhóm của assignee, và được suy ra.** Vì admin không tạo task ở luồng thường, mọi task đều có assignee là leader hoặc member. Mỗi người lại thuộc đúng một nhóm. Do đó không thêm cột `team_id` riêng trên Task. Phạm vi suy ra qua `assignee.team_id`. Cách này tránh denormalize, để khỏi có hai nguồn sự thật lệch nhau. Reassign luôn trong nhóm nên bất biến này không vỡ.
- **Nâng cấp cho portfolio:** nếu cần một task cho nhiều người làm thật sự thì nâng lên many-to-many. Không làm ở bản v1.

### 5.3. Phạm vi nhìn thấy (visibility)
- **Member:** thấy mọi việc trong nhóm mình. Với việc không phải của mình thì chỉ đọc. Chỉ sửa tiến độ việc được giao cho mình. Mục đích là minh bạch nội bộ nhóm.
- **Leader:** thấy và quản toàn bộ việc trong nhóm mình.
- **Ngang cấp:** leader không thấy nhóm khác. Đây là nguyên tắc least privilege, tức trao quyền tối thiểu. Cross-team visibility để dành cho bản portfolio.
- **Admin:** thấy xuyên suốt hệ thống, vì mục đích quản trị. Ở luồng thường admin chỉ đọc. Thao tác ghi chỉ qua break-glass, xem mục 2.2.

### 5.4. Bất biến tổ chức dưới soft-delete
Hệ thống ưu tiên **xoá mềm (soft-delete)** thay vì xoá cứng, để giữ lịch sử task. Vì vậy cần định rõ điều gì xảy ra khi một user bị vô hiệu hoá. Sự bất đối xứng giữa leader và member ở đây là có chủ đích.

- **Vô hiệu hoá leader thì chặn cứng nếu chưa có người thay.** Leader là vị trí cấu trúc, vì gánh cả nhóm. Hệ thống từ chối vô hiệu hoá leader cho tới khi admin chỉ định leader thay. Đây là bất biến cứng.
- **Vô hiệu hoá member thì cho phép và báo leader.** Member không gánh cấu trúc nên cho vô hiệu hoá. Hệ thống báo leader số task còn treo của member đó. Task vẫn nằm trong phạm vi nhóm. Lý do là user chỉ bị xoá mềm, nên row member còn nguyên `team_id`. Phạm vi nhóm của task suy ra qua `assignee.team_id` được bảo toàn, vì Task không có cột `team_id` riêng, xem mục 5.2. Leader reassign cho người khác trong nhóm. Không cần admin can thiệp.

---

## 6. Ma trận phân quyền (permission matrix)

> Chú giải bảng. Dấu tick nghĩa là được phép ở luồng thường. Dấu chéo nghĩa là không được phép. BG nghĩa là chỉ qua nhánh break-glass cứu hộ của admin, không phải luồng thường, xem mục 2.2. Dấu gạch ngang trong bảng nghĩa là không áp dụng.

| Hành động | Member | Leader | Admin |
|---|---|---|---|
| Đăng nhập, xem hồ sơ mình | ✅ | ✅ | ✅ |
| Tạo task và giao cho member trong nhóm | ❌ | ✅ (nhóm mình) | ❌ |
| Tạo task cho chính mình | ✅ | ✅ | — (ngoài cây tổ chức) |
| Giao việc cho người khác | ❌ | ✅ (trong nhóm) | BG |
| Cập nhật **tiến độ** task được giao cho mình | ✅ | ✅ | — (không là assignee) |
| Sửa hoặc xoá **định nghĩa** task mình tạo | ✅ | ✅ | — (không tạo task) |
| Sửa hoặc xoá định nghĩa task do người khác giao | ❌ | ✅ (trong nhóm) | BG |
| Reassign task của member bị vô hiệu hoá | ❌ | ✅ (trong nhóm) | BG |
| Xem việc của thành viên khác trong nhóm | ✅ (đọc) | ✅ | ✅ (đọc, xuyên suốt) |
| Xem việc nhóm khác | ❌ | ❌ | ✅ |
| Dashboard thống kê nhóm | ❌* | ✅ (nhóm mình) | ✅ (mọi nhóm) |
| Quản lý user, gán nhóm, gán role, vô hiệu hoá user | ❌ | ❌ | ✅ |

> Dấu sao ở dòng dashboard. Member dashboard cá nhân, tức "việc của tôi", thuộc nhóm Could-have ở MoSCoW mục 9. Nó không thuộc bản v1 bắt buộc.
> BG. Nhánh break-glass của admin tách bạch với luồng thường và được ghi lại bằng log ứng dụng, xem mục 2.2.

---

## 7. User stories (theo role)

### Admin
- Là admin, tôi muốn tạo và khoá tài khoản người dùng để kiểm soát ai truy cập hệ thống.
- Là admin, tôi muốn gán user vào nhóm và đặt vai trò leader hoặc member để phản ánh cơ cấu tổ chức.

### Leader
- Là leader, tôi muốn tạo việc và giao cho member trong nhóm để phân công công việc.
- Là leader, tôi muốn xem toàn bộ việc của nhóm kèm tiến độ và tình trạng hạn, để biết nên đốc thúc hoặc hỗ trợ ai.
- Là leader, tôi muốn lọc việc theo trạng thái và người phụ trách để nhanh chóng tìm điểm nghẽn.
- Là leader, tôi muốn xem dashboard thống kê việc theo trạng thái và người phụ trách để nắm tình hình nhóm.

### Member
- Là member, tôi muốn xem danh sách việc được giao cho mình để biết phải làm gì.
- Là member, tôi muốn tự tạo task cho chính mình để ghi nhận việc tự phát và minh bạch trong nhóm. Member không giao được cho người khác, vì quyền điều phối là của leader.
- Là member, tôi muốn cập nhật tiến độ việc của mình, gồm Đang xử lý và Hoàn thành, để phản ánh thực tế.
- Là member, tôi muốn thấy nhóm đang làm gì trong phạm vi nhóm để phối hợp.
- Là member, tôi muốn được thông báo khi được giao việc mới để không bỏ sót. Đây là tính năng mở rộng.

---

## 8. Yêu cầu phi chức năng (non-functional)

- **Bảo mật.** Mật khẩu hash bằng bcrypt hoặc argon2. Auth dùng JWT access token sống ngắn, cộng refresh token lưu server và thu hồi được, có rotation. Rotation nghĩa là mỗi lần refresh phát token mới và vô hiệu token cũ. Phân quyền kiểm tra ở backend bằng guard, không tin client.
- **Tính nhất quán.** Ràng buộc toàn vẹn đặt ở tầng DB, gồm khoá ngoại và enum trạng thái.
- **Khả năng mở rộng.** API stateless. Hiểu chính xác là không có session dính-instance và không có state trong RAM của app. Nó không có nghĩa là "không có state server". Do đó refresh token store phải dùng chung, qua DB hoặc Redis, không lưu in-memory theo từng instance. Như vậy chạy nhiều instance sau Docker mới không vỡ.
- **Khả năng bảo trì.** Kiến trúc module hoá theo NestJS, tách tầng controller, service, repository.
- **Tài liệu hoá.** OpenAPI và Swagger sinh từ code.
- **Khả dụng.** UI đơn giản, ưu tiên rõ ràng hơn hoa mỹ, phù hợp định hướng backend.

---

## 9. MoSCoW — khoanh phạm vi

### Must have (bản v1)
- Auth, gồm đăng nhập, JWT access cộng refresh token có rotation, hash mật khẩu, thu hồi khi logout.
- Quản lý user và gán nhóm hoặc role cho admin. Có **xoá mềm** user với bất biến tổ chức ở mục 5.4, tức chặn vô hiệu hoá leader khi chưa có người thay, và báo leader để reassign khi vô hiệu hoá member.
- CRUD task, giao việc, cập nhật tiến độ.
- Hai trục trạng thái, gồm tiến độ và tình trạng hạn suy ra.
- Phân quyền theo ma trận mục 6, kiểm ở backend.
- Lọc theo trạng thái và người phụ trách, cộng tìm kiếm cơ bản.
- Dashboard thống kê theo trạng thái và người phụ trách.
- Docker Compose cho app và DB, cộng Swagger, cộng tài liệu kỹ thuật ngắn.

### Should have (bản v1 nếu kịp)
- Phân trang danh sách task.
- Lọc nâng cao theo deadline và theo tình trạng hạn.
- Validation và thông báo lỗi rõ ràng, nhất quán.
- Refresh token **reuse-detection**, tức trình một token đã dùng thì thu hồi cả họ token. Rotation một mình chưa cho lợi ích bảo mật chính. Reuse-detection thêm rẻ trên nền rotation, và bảo mật là ưu tiên cao nhất.

### Could have (mở rộng, đầu portfolio)
- Gửi email hoặc thông báo khi được giao việc.
- Biểu đồ thống kê trên dashboard.
- Dashboard cá nhân cho member, tức "việc của tôi".

### Won't have (bản v1, để dành portfolio)
- Cây tổ chức đầy đủ ba tầng Công ty, Phòng, Nhóm.
- Task giao cho nhiều người, tức many-to-many thật sự.
- Cross-team visibility cho leader hoặc manager.
- Real-time qua websocket, và comment hoặc đính kèm file trên task.
- Audit log đầy đủ. Đây là bảng riêng ghi ai đổi gì và khi nào, truy vấn được trong app, làm bằng interceptor tập trung. Để dành portfolio. Cần phân biệt rõ một điểm. Thao tác break-glass hiếm của admin chỉ ghi bằng log ứng dụng thông thường, qua stdout hoặc Docker logs. Nó không phải tính năng audit log này. Nên hai thứ không mâu thuẫn.

---

## 10. Truy vết & bước tiếp theo

Tài liệu này là nguồn tham chiếu cho các giai đoạn sau.
- **Giai đoạn 4, Kiến trúc:** module hoá theo các bounded context, gồm Auth, Users và Org, Tasks, Stats.
- **Giai đoạn 5, Data schema:** thực thể User, Team, Task; quan hệ owner và assignee; enum trạng thái.
- **Giai đoạn 6, API contract:** endpoint CRUD cộng auth cộng thống kê; nơi áp ma trận phân quyền mục 6.

> Ghi chú phương pháp. Tài liệu cố tình ghi *lý do* cho từng quyết định. Ví dụ tách hai trục phân quyền, ownership tách khỏi assignment, suy ra OVERDUE, và rút gọn cây tổ chức. Đây là phần dùng để **kể chuyện khi phỏng vấn**.
