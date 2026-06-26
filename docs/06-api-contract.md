# Giai đoạn 6 — API contract

> Hệ thống quản lý công việc nội bộ (Internal Task Management System)
> Tài liệu này biến các quyết định nghiệp vụ, kiến trúc và schema (Giai đoạn 1 tới 5) thành **hợp đồng API**: endpoint, DTO, status code, envelope lỗi, luồng auth. Như các tài liệu trước, nó ghi lại lựa chọn đã cân nhắc, quyết định, và lý do. Mọi quyết định ở đây truy ngược về được Giai đoạn 1 tới 5.
> Stack: NestJS + Postgres + Prisma. Prefix toàn API: `/api/v1`.

---

## Bảng thuật ngữ

Document dùng nhiều thuật ngữ lặp lại. Bảng này neo nghĩa một lần. Thân bài sau đó dùng thẳng từ tiếng Anh.

| Thuật ngữ | Nghĩa ngắn |
|---|---|
| hợp đồng (contract) | Bản giao kèo về interface giữa client và server. Định nghĩa cái client được thấy và được làm. |
| endpoint | Một địa chỉ HTTP cụ thể, gồm method và path. Ví dụ `POST /tasks`. |
| phạm vi (scope) | Tập bản ghi mà một người được phép thấy. Ở đây phạm vi của một người là nhóm của người đó. |
| phân quyền mức bản ghi (record-level) | Kiểm quyền trên từng bản ghi cụ thể, không chỉ theo vai trò. |
| owner | Người giao task. Sở hữu định nghĩa task, được sửa và xoá. |
| assignee | Người được giao task. Chỉ được đổi tiến độ. |
| IDOR | Lỗ hổng đổi ID trên URL để truy cập dữ liệu của người khác. |
| guard | Lớp chặn ở rìa HTTP. Trả lời câu hỏi "vai trò này có được gọi endpoint không". |
| policy | Lớp quyết định phân quyền mức bản ghi. Trả lời "người này có quyền trên bản ghi cụ thể này không". |
| DTO | Data Transfer Object. Hình dạng dữ liệu vào hoặc ra ở biên HTTP. |
| envelope lỗi | Khung JSON thống nhất bọc mọi lỗi trả về. |
| projection (phép chiếu) | Việc chọn lọc field từ domain để lộ ra response. Cố tình bỏ bớt field và thêm field. |
| rotation | Mỗi lần refresh thì phát token mới và vô hiệu token cũ. |
| reuse-detection | Phát hiện một token đã dùng bị trình lại, rồi thu hồi cả họ token. |
| break-glass | Cơ chế cứu hộ khẩn cấp của admin. Nằm ngoài luồng thường và có ghi log. |
| xoá mềm (soft-delete) | Đánh dấu đã xoá thay vì xoá thật, để giữ lịch sử. |
| computed field | Field suy ra lúc đọc, không lưu cột. Ví dụ OVERDUE. |
| same-origin | Frontend và backend phục vụ trên cùng một origin, nên cookie và CORS đơn giản. |

---

## 0. Triết lý: hợp đồng là ranh giới

Hợp đồng là nguồn sự thật của interface giữa client và server. Nó định nghĩa cái client được thấy và được làm. Nó không lộ nội tại của hệ thống.

Từ "ranh giới" ở đây gộp ba chức năng khác nhau. Tách rõ ba cái giúp biết mỗi quy ước sinh ra để làm gì.

- **Ranh giới bảo mật.** Không lộ sự tồn tại của resource ngoài phạm vi. Không lộ field nhạy cảm. Đây là gốc của quy ước 404 so với 403, của việc ẩn `passwordHash`, và của việc phạm vi do server suy ra chứ không nhận từ client.
- **Ranh giới coupling.** Hợp đồng là interface mà frontend phụ thuộc vào, nên nó phải ổn định. Đây là gốc của quy ước đặt tên, kiểu chữ, và hình dạng envelope nhất quán.
- **Phép chiếu có chủ đích.** Response không phải là model trong database. Nó là một phép chiếu cố tình lấy thiếu. Response thêm field suy ra như OVERDUE. Response bỏ field nội tại như `passwordHash` và `teamId`.

Hệ quả của lăng kính thứ ba là một câu cần nhớ xuyên suốt: hình dạng hợp đồng khác hình dạng schema, và cả hai khác hình dạng domain. Câu này chặn một lỗi lười phổ biến là serialize thẳng model Prisma ra response.

> Nguyên tắc vận hành: nhất quán convention quan trọng hơn sáng tạo từng endpoint. Mọi quyết định ở Giai đoạn 1 tới 5 phải map vào một hình dạng cụ thể. OVERDUE là một filter cộng một computed field, không phải một status. Phạm vi do server suy ra, không nhận param từ client. Owner và assignee là hai quyền khác nhau trên cùng một resource.

---

## 1. Quy ước toàn cục

Các quy ước dưới đây áp cho mọi endpoint. Nêu một lần ở đây để phần sau không lặp lại.

| Quy ước | Quyết định | Ghi chú |
|---|---|---|
| Prefix | `/api/v1` | Là một namespace tĩnh, không phải một chiến lược versioning. Xem ghi chú dưới. |
| Kiểu chữ JSON | camelCase | Cho mọi field request và response. |
| Thời gian | Chuỗi ISO-8601 ở UTC, kết thúc bằng `Z` | Khớp `timestamptz` ở schema. Frontend tự đổi sang giờ người dùng. |
| ID | cuid2, dạng opaque | Defense-in-depth chống IDOR, không phải ranh giới. |
| Enum | Giữ y nguyên giá trị enum của database | `TODO`, `IN_PROGRESS`, `DONE`, `ADMIN`, `LEADER`, `MEMBER`. Không có lớp dịch. Frontend và backend dùng chung từ vựng. |
| Triển khai | same-origin | Vite proxy lúc dev, reverse-proxy lúc prod. Giữ cookie sạch, tránh CORS. |

Ghi chú về versioning. Giai đoạn 4 mục 8.5 đã hoãn việc làm versioning khỏi bản nộp. Quyết định ở đây không nghịch điều đó. `/api/v1` chỉ là một tiền tố tĩnh để dành chỗ. Nó khác một chiến lược versioning thật, vốn cần đàm phán content-negotiation và chính sách ngừng hỗ trợ phiên bản cũ. Thêm prefix thì rẻ và không cam kết gì thêm.

---

## 2. Toàn cảnh resource và endpoint

Bảng này là bản đồ đầy đủ của surface. Các mục sau đi sâu vào từng nhóm.

| Nhóm | Endpoint | Hành động | Ai gọi |
|---|---|---|---|
| auth | `POST /auth/login` | Đăng nhập | Mọi người |
| auth | `POST /auth/refresh` | Làm mới token | Người có refresh cookie |
| auth | `POST /auth/logout` | Đăng xuất | Người đang đăng nhập |
| auth | `GET /auth/me` | Lấy lại danh tính của chính mình | Người đang đăng nhập |
| tasks | `POST /tasks` | Tạo task | leader hoặc member |
| tasks | `GET /tasks` | List task trong nhóm, có lọc và phân trang | member trong nhóm |
| tasks | `GET /tasks/:id` | Xem một task | member trong nhóm |
| tasks | `PATCH /tasks/:id` | Sửa định nghĩa task | owner |
| tasks | `PATCH /tasks/:id/progress` | Đổi tiến độ | assignee |
| tasks | `PATCH /tasks/:id/assignee` | Đổi người được giao, trong nhóm | leader của nhóm |
| tasks | `DELETE /tasks/:id` | Xoá mềm | owner |
| stats | `GET /stats` | Số liệu dashboard của nhóm | leader |
| users | `POST /users` | Tạo tài khoản | admin |
| users | `GET /users` | List user | admin |
| users | `GET /users/:id` | Xem một user | admin |
| users | `PATCH /users/:id` | Sửa tên user | admin |
| users | `POST /users/:id/deactivate` | Vô hiệu hoá user | admin |
| users | `POST /users/:id/reactivate` | Kích hoạt lại user | admin |
| teams | `POST /teams` | Tạo nhóm | admin |
| teams | `GET /teams` | List nhóm | admin |
| teams | `GET /teams/:id` | Xem một nhóm | admin |
| teams | `PATCH /teams/:id` | Đổi tên nhóm | admin |
| teams | `PUT /teams/:id/leader` | Đặt leader của nhóm, đổi atomic | admin |
| teams | `GET /teams/:id/members` | List thành viên nhóm của chính mình | member trong nhóm |
| teams | `DELETE /teams/:id` | Giải thể nhóm, là thao tác break-glass | admin |

Hình dạng của phần tasks trong bảng này không tuỳ tiện. Nó là hệ quả trực tiếp của keystone ở mục 3. Vì lý do đó, mục 3 giải thích trước rồi các mục sau mới đi vào chi tiết DTO.

---

## 3. Keystone — trục "thấy được" so với "được phép"

Hai câu hỏi từng được xếp thành hai mục riêng trong sườn ban đầu. Câu thứ nhất là owner khác assignee thì map vào endpoint thế nào. Câu thứ hai là IDOR trả 403 hay 404. Khi soi kỹ thì chúng là hai mặt của một quyết định.

Lý do gộp: không thể phát biểu luật 403 so với 404 nếu chưa có sẵn phân biệt giữa "thấy được" và "được phép". Mà phân biệt đó chính là cái mô hình owner, assignee, và nhóm cung cấp. Nên cắt hợp lý là coi cả hai là một keystone, tổ chức quanh một trục duy nhất.

Trục đó là: cái gì client được **thấy**, so với cái gì client được **làm**. "Thấy được" gắn với phạm vi, và phạm vi định ra ranh giới 404. "Được làm" gắn với hành động, và hành động bị cấm thì trả 403.

### 3.1. Tách endpoint theo chủ thể phân quyền

Nguyên tắc chốt: một endpoint mang đúng một luật phân quyền.

Phương án thay thế là dùng một endpoint `PATCH /tasks/:id` rồi kiểm quyền theo từng field trong body. Phương án đó có một mùi chí mạng. Quyền thay đổi sẽ phụ thuộc vào việc body chứa field nào. Đây là nguồn kinh điển của lỗ hổng mass-assignment (lỗ hổng nhồi field trái phép vào body để leo thang quyền). Một assignee có thể lén nhét `assigneeId` hoặc `title` vào body của một request đáng lẽ chỉ đổi tiến độ. Swagger cũng không diễn đạt nổi luật "tuỳ field tuỳ người". Và policy không khai báo gọn được, vì điều kiện trở thành "endpoint này cần quyền X, nhưng còn tuỳ".

Tách endpoint thì mỗi cái có một chủ thể, một predicate, và một dòng khai báo policy. Cách này khớp đúng với application layer ở Giai đoạn 4 mục 3.1, nơi đã tách sẵn use-case `UpdateProgress` khỏi `EditDefinition`.

Một task có đúng ba chủ thể phân quyền, nên có ba endpoint thay đổi. Đây là số tối thiểu để giữ luật "một luật một endpoint", không phải vẽ thêm cho đẹp.

| Endpoint | Hành động | Chủ thể được phép |
|---|---|---|
| `POST /tasks` | Tạo | leader giao member trong nhóm, hoặc member tự giao |
| `GET /tasks`, `GET /tasks/:id` | Đọc và list | Mọi member trong nhóm, phạm vi do server suy ra |
| `PATCH /tasks/:id` | Sửa định nghĩa, gồm title, description, deadline | owner |
| `PATCH /tasks/:id/progress` | Đổi tiến độ | assignee |
| `PATCH /tasks/:id/assignee` | Đổi người được giao, trong nhóm | leader của nhóm |
| `DELETE /tasks/:id` | Xoá mềm, trả 204 | owner |

Đánh đổi đã biết: nhiều endpoint hơn, và hai endpoint có dáng hơi RPC là `/progress` và `/assignee`, thay vì một PATCH thuần REST. Cái mua được là an ninh và tính khai báo được. Ở một ứng dụng đặt bảo mật lên hàng đầu, đổi như vậy là đáng.

Vì sao reassign tách riêng, và vì sao chủ thể của nó là leader chứ không phải owner. Việc giao việc cho một người là một quyền điều phối tổ chức, theo mô hình hai trục của Giai đoạn 1. Quyền đó thuộc về leader của nhóm. Quyền duy nhất của member trong việc giao việc là tự giao cho mình lúc tạo, theo FR-TASK-01. Member không bao giờ đổi assignee. Vì lý do đó, `PATCH /tasks/:id/assignee` chỉ cho leader của nhóm.

Tách reassign khỏi `PATCH /tasks/:id` vì hai thao tác có hai chủ thể khác nhau. Sửa định nghĩa, gồm title và deadline, là quyền của owner, tức người viết ra task. Quyết định ai làm việc đó là quyền của leader. Gộp hai thứ vào một endpoint owner-only sẽ trộn hai chủ thể, và còn để member tự giao việc cho người khác, vốn nghịch FR-TASK-01. Endpoint reassign leader-only xử lý gọn cả hai luồng quan trọng. Một là leader cân bằng lại tải trong nhóm. Hai là leader giao lại task treo khi một member bị vô hiệu hoá, đúng FR-USER-01, mà không cần nhánh đặc biệt. Reassign chỉ đổi assignee, không đổi owner.

> Ghi chú phỏng vấn: ranh giới ở đây nhất quán với mô hình hai trục. Owner sở hữu định nghĩa của một việc. Leader sở hữu việc phân công người làm. Một member tự tạo task thì làm owner định nghĩa của task đó, nhưng vẫn không có quyền giao nó cho người khác. Tách chủ thể như vậy giữ cho member không lách thành người điều phối ngầm.

### 3.2. IDOR — ngoài phạm vi trả 404, trong phạm vi nhưng bị cấm trả 403

Luật chốt phát biểu gọn như sau. 404 nghĩa là "bạn không được phép biết nó tồn tại", áp cho resource ở nhóm khác. 403 nghĩa là "bạn thấy được nó, nhưng hành động này không phải của bạn", áp cho resource cùng nhóm mà sai owner, sai assignee, hoặc sai vai trò.

Một task ở nhóm khác trả 404. Response này trùng với response của một task không tồn tại. Nhờ vậy kẻ tấn công không phân biệt được "sai nhóm" với "không có". Đây là cách giấu sự tồn tại ở mức cao nhất. FR-TASK-04 cố ý để ngỏ lựa chọn giữa 403 và 404, và quyết định ở đây chọn hướng an toàn hơn.

Điểm mạnh nhất của luật này, và cũng là phần truy vết, là nó rơi thẳng ra từ scoped-repository đã chốt ở schema mục 5. Default scope đặt ở tầng port và query. Cơ chế như sau.

```
Tải task qua scoped-load (repo đã lọc theo nhóm cho người không phải admin)
   ├─ miss  → 404  (resource nằm ngoài phạm vi, hoặc không tồn tại)
   └─ hit   → chạy predicate của hành động
                 ├─ pass → thực thi
                 └─ fail → 403  (thấy được nhưng không được phép)
```

Cùng một choke-point của phạm vi vừa đỡ việc lọc list, vừa đẻ ra ranh giới 404 cho IDOR ở thao tác trên một resource. Nó không phải một lớp gắn thêm. Hệ quả phụ đẹp: admin không có nhóm, nên scoped-load chặn admin khỏi `/tasks` thường và trả 404. Điều này khớp đúng với quyết định admin đứng ngoài cây tổ chức và chỉ vào luồng task qua break-glass.

Đã cân nhắc trường phái "luôn trả 404, không bao giờ 403", kiểu GitHub dùng. Trường phái đó không hợp ứng dụng này. FR-TASK-04 cố ý cho member thấy mọi task trong nhóm, nên `GET` trả 200 cho member. Vì member đã thấy được task cùng nhóm, trả 403 ở một thao tác `PATCH` cùng nhóm không lộ thêm thông tin gì mới. Dùng 404 ở chỗ đó còn tự mâu thuẫn, vì `GET` trả 200 mà `PATCH` lại trả 404 cho cùng một task. Ở ứng dụng này, thấy được tương đương đọc được tương đương cùng nhóm. Nên việc tách 404 và 403 là đúng mô hình, không để hở.

### 3.3. Cách khai báo trong hợp đồng

Hợp đồng chỉ khai báo, không chứa code. Mỗi endpoint ghi rõ hai thứ. Thứ nhất là guard theo vai trò. Thứ hai là policy mức bản ghi cần thoả. Quy ước "miss thì 404, predicate fail thì 403" áp cho toàn surface, gồm tasks, users, và teams. Người không phải admin chỉ thấy resource trong phạm vi của mình. Admin có phạm vi toàn hệ thống, nhưng đi qua nhánh break-glass ở mục 9. Phần thực thi của guard và policy thuộc Giai đoạn 7.

---

## 4. Tasks — đọc, lọc, phân trang

Trung tâm của mục này là cách OVERDUE xuất hiện trong hợp đồng. OVERDUE là một trục lọc trực giao, không phải một giá trị của progress. Đây là chỗ quyết định "hai trục độc lập" của Giai đoạn 1 sống hay chết trong API.

### 4.1. Query param của `GET /tasks`

| Param | Kiểu | Ý nghĩa | Ghi chú |
|---|---|---|---|
| `progress` | enum | `TODO`, `IN_PROGRESS`, hoặc `DONE` | Không có giá trị `OVERDUE` ở đây |
| `overdue` | bool | `true` chỉ lấy quá hạn, `false` chỉ lấy chưa quá hạn, bỏ trống lấy tất cả | Trục riêng, kết hợp AND với `progress` |
| `assigneeId` | cuid2 | Lọc theo người được giao | ID ngoài nhóm thì query đã scoped trả rỗng, không lộ |
| `q` | string | Tìm ILIKE trên title và description | Bỏ trống thì bỏ qua |
| `page` | int, từ 1 | Mặc định 1 | offset bằng (page trừ 1) nhân limit |
| `limit` | int | Mặc định 20, trần 100 | Theo PERF-03 |

Mọi filter kết hợp theo AND. Ví dụ `?progress=IN_PROGRESS&overdue=true` lấy đúng tập "Đang xử lý và Quá hạn" mô tả ở FR-TASK-05. Hai trục giao nhau và biểu diễn tự nhiên, vì chúng nằm ở hai param tách biệt.

> Đây là phép thử để biết đã map đúng mô hình hai trục. Nếu OVERDUE từng là `?progress=OVERDUE`, thì ca "Đang xử lý và Quá hạn" trở thành không biểu diễn được. Việc tách `overdue` thành param riêng giữ cho ca đó vẫn nói được.

Không có param `teamId`. Phạm vi suy ra từ JWT, đi qua user tới teamId, tại tầng repository. Đây chính là choke-point phạm vi ở mục 3.3. Client không chọn được nhóm. Admin bị chặn khỏi `/tasks` thường và xử lý qua mục 9.

Sort cố định là `createdAt DESC, id DESC`. Cột id làm tiebreak nên trang luôn tất định. Quyết định ở đây là không cho client chọn sort qua `?sort=`. Spec không đòi việc đó. Sort theo deadline còn kéo theo một nếp gấp là phải xử lý NULLS LAST cho task không có deadline, và cần một index khác. Đây là một đường nâng cấp để dành portfolio.

### 4.2. Response của list

Field `overdue` là computed field. Projection lấy tối thiểu. Việc ẩn `passwordHash` là hệ quả hiển nhiên. Hợp đồng cũng không lộ `teamId` của task, vì task không có cột đó, và không lộ `deletedAt`.

```jsonc
{
  "data": [
    {
      "id": "ckx...",
      "title": "Migration prod",
      "description": "...",
      "progress": "IN_PROGRESS",
      "deadline": "2026-06-22T17:00:00.000Z",   // ISO-8601 UTC, có thể null
      "overdue": true,                            // computed, không phải progress
      "owner":    { "id": "...", "name": "Bích" },
      "assignee": { "id": "...", "name": "Bảo" },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 7, "totalPages": 1 }
}
```

Quyết định trả `total`. Việc này cần một câu `COUNT` trên tập đã lọc và đã scoped. Ở quy mô 5000 task thì rẻ. Cái mua được là frontend hiển thị được tổng số trang. Phân trang kiểu keyset vẫn để dành, theo schema mục 7.

Một bảo đảm của hợp đồng, phần thực thi thuộc Giai đoạn 7. Field `overdue` và filter `?overdue=` dùng chung một mốc thời gian `now`, tính một lần cho mỗi request. Nhờ vậy cờ và bộ lọc không lệch nhau một mili-giây. Điều này khớp Giai đoạn 4 mục 8.4.

Param sai, như enum lạ hoặc page nhỏ hơn 1, trả 400 với chi tiết theo từng field. Lỗi này phát ở pipe ngoài rìa, xem mục 7.

---

## 5. Stats — dashboard

`GET /stats` chỉ cho leader, phạm vi do server suy ra. Hình dạng response ép cứng quy tắc "OVERDUE không phải bucket thứ tư", bằng chính cấu trúc dữ liệu chứ không bằng kỷ luật của người code.

```jsonc
{
  "scope": { "teamId": "...", "teamName": "Backend" },
  "total": 6,                                               // bằng tổng byProgress
  "byProgress": { "TODO": 2, "IN_PROGRESS": 2, "DONE": 2 }, // đúng 3 key
  "overdue": 2,                                             // lát cắt, là tập con của TODO cộng IN_PROGRESS
  "byAssignee": [
    {
      "assignee": { "id": "...", "name": "An" },
      "byProgress": { "TODO": 1, "IN_PROGRESS": 1, "DONE": 1 },
      "overdue": 1
    },
    {
      "assignee": { "id": "...", "name": "Bảo" },           // member đang rảnh, vẫn hiện với số 0
      "byProgress": { "TODO": 0, "IN_PROGRESS": 0, "DONE": 0 },
      "overdue": 0
    }
  ]
}
```

Ba bất biến được chính hình dạng bảo chứng.

- **Phân bố tiến độ đúng ba key.** `byProgress` chỉ có `TODO`, `IN_PROGRESS`, `DONE`. Không có chỗ nào để nhét OVERDUE thành một bucket ngang hàng.
- **OVERDUE đứng ngang cấp, không nằm trong.** `overdue` là sibling của `byProgress`, không phải một key bên trong nó. Nhờ vậy không có đếm trùng.
- **Tổng tách khỏi lát cắt.** `total` bằng tổng của `byProgress`. Số `overdue` nằm ngoài tổng đó.

> Đây là hợp đồng làm cho cái sai trở nên bất khả, đúng tinh thần "hợp đồng là ranh giới". Một dashboard gộp OVERDUE thành bucket thứ tư sẽ đếm trùng task vừa IN_PROGRESS vừa quá hạn. Cấu trúc trên không cho hình dạng đó tồn tại.

Một quy tắc thành viên cho `byAssignee`. Mảng này gồm toàn bộ tập sau. Một là mọi member đang hoạt động của nhóm. Hai là mọi assignee còn task trong scope. Hợp hai tập này lại bằng một outer join giữa danh sách thành viên và bảng task. Quy tắc này cho hai thứ cùng lúc. Member đang rảnh vẫn hiện ra với toàn số 0, nên leader thấy được cả người chưa có việc. Một member đã bị vô hiệu hoá nhưng còn task treo cũng vẫn hiện, nên không task nào bị rơi khỏi phân rã.

> Hệ quả là tổng các con số trong `byAssignee` luôn bằng `total`. Nếu chỉ lấy member có ít nhất một task, thì một member bị vô hiệu hoá còn task treo sẽ biến mất khỏi `byAssignee`, trong khi task của họ vẫn nằm trong `total`, làm hai số lệch nhau. Quy tắc hợp hai tập đóng đúng kẽ hở đó.

Các nhánh còn lại đã chốt theo hướng best-practice và chống over-engineer. Muốn đổi thì nêu.

- Outer join chỉ là một query đọc, không động tới schema. Index sẵn có đỡ đủ. Index trên `User(teamId)` lọc danh sách thành viên. Index trên `Task(assigneeId, progress)` đỡ phần join. Stats vẫn chỉ phụ thuộc `TaskQueryPort`, không thêm phụ thuộc sang Users.
- Endpoint chỉ cho leader, đúng FR-DASH-01. Cho member xem thì chỉ cần bỏ guard vai trò, rất nhẹ.
- Task đã DONE mà quá hạn không vào `overdue`, vì predicate loại nó ra. Seed của dự án đã có sẵn ca này để kiểm chứng.

Khai báo phân quyền. `GET /tasks` dùng guard "là member trong nhóm". `GET /stats` dùng guard vai trò leader cộng phạm vi suy ra. Quy ước "miss thì 404, predicate fail thì 403" đã khoá ở keystone vẫn áp ở đây.

---

## 6. Auth — login, refresh, logout

### 6.1. Token để ở đâu

Cách đặt vấn đề sai là hỏi "chọn thua XSS hay thua CSRF". Cách đúng là tách nơi lưu theo từng loại token. Làm vậy thì né được cả hai.

| Nơi lưu | access token | refresh token |
|---|---|---|
| localStorage hoặc body JSON | XSS đọc được, nhưng token sống ngắn | XSS đọc được một token sống 7 ngày, đây là thảm hoạ |
| Bộ nhớ tạm cộng Bearer header | XSS chỉ chạm tới được trong 15 phút, không lưu lại; call API miễn nhiễm CSRF vì header không tự gửi cross-site | không áp dụng |
| httpOnly cookie | mất khả năng đọc để gắn vào header | XSS không đọc được; cookie chỉ gửi tới một endpoint |

Quyết định: access token để trong bộ nhớ tạm và gửi qua Bearer header. Refresh token để trong httpOnly cookie. Lý do, và đây cũng là điểm kể chuyện mạnh:

- Call API dùng `Authorization: Bearer`, không dùng cookie. Một request giả mạo cross-site sẽ không kèm token, vì trình duyệt không tự đính header. Nhờ vậy call API miễn nhiễm CSRF.
- Refresh token để trong httpOnly cookie, nên JavaScript không đọc được credential sống 7 ngày. Nhờ vậy refresh token miễn nhiễm XSS.
- Cookie chỉ gửi tới đúng `/auth/refresh` và `/auth/logout`, nhờ thuộc tính `Path`. Diện CSRF thu về một chỗ duy nhất. Thuộc tính `SameSite=Lax` chặn POST cross-site. Mà response cross-origin lại không đọc được vì CORS. Nên kẻ tấn công không lấy được token mới kể cả khi kích được request.

> Điều này không phải gold-plating. Dự án đã chốt rotation cộng reuse-detection, là một khoản đầu tư bảo mật không nhỏ. Để refresh token trong localStorage thì tự mâu thuẫn. Đó là xây một cái máy bắt trộm token rồi lại để credential cho JavaScript đọc thoải mái. Cookie là lựa chọn lưu trữ nhất quán với việc bảo mật là NFR cao nhất. Phương án body JSON chỉ đáng chọn khi buộc phải tách origin cứng, hoặc khi client không phải trình duyệt. Đây không phải ca đó, vì frontend là một React SPA.

### 6.2. Hợp đồng endpoint

```jsonc
POST /auth/login        body { email, password }
  200  Set-Cookie: refresh_token (thuộc tính ở mục 6.4)
       { accessToken, user: { id, name, role, teamId } }     // user để frontend render ngay
  401  INVALID_CREDENTIALS   "email hoặc mật khẩu không đúng" (chung, không lộ email có tồn tại)
  403  ACCOUNT_DISABLED      tài khoản bị vô hiệu hoá

POST /auth/refresh      không có body, refresh đọc từ cookie
  200  Set-Cookie: refresh_token mới (rotation)
       { accessToken }
  401  SESSION_EXPIRED cộng xoá cookie   // gộp các ca: thiếu, không thấy, đã thu hồi, hết hạn, và reuse

POST /auth/logout       không có body, đọc cookie
  204  thu hồi token hiện tại, set revokedAt, và xoá cookie

GET  /auth/me           Bearer
  200  { user: { id, name, role, teamId } }   // frontend gọi sau khi reload để lấy lại danh tính
```

Endpoint `GET /auth/me` đóng một khoảng trống. Sau khi reload trang, frontend mất access token trong bộ nhớ tạm. Nó gọi `/auth/refresh` để có access token mới, rồi gọi `/auth/me` để lấy lại hồ sơ người dùng. Hồ sơ gồm role và teamId để frontend dựng lại giao diện. SEC-03 nói frontend chỉ ẩn hiện cho dễ dùng, nhưng nó vẫn cần biết danh tính để render.

### 6.3. Thứ tự kiểm tra login

FR-AUTH-02 có hai vế kéo ngược nhau. Vế một đòi không lộ email có tồn tại hay không. Vế hai đòi báo rõ khi tài khoản bị vô hiệu hoá. Thứ tự kiểm tra dưới đây giải được cả hai.

Bước một là verify mật khẩu, theo kiểu so sánh tốn thời gian cố định. Mật khẩu sai thì trả 401 chung, bất kể user có tồn tại hay đang hoạt động. Điều này chống dò email. Bước hai chỉ chạy khi mật khẩu đúng. Nếu lúc đó `isActive` bằng false thì trả 403 `ACCOUNT_DISABLED`. Trạng thái bị vô hiệu hoá chỉ lộ cho người đã có mật khẩu đúng. Nên nó không phải một kẽ hở dò email thật, mà đúng là yêu cầu giao diện đòi.

### 6.4. Cross-cutting

- **Claims trong access token.** Gồm `sub`, `role`, `teamId`, `iat`, `exp`. Có role và teamId trong token để guard vai trò chạy mà không cần truy database. Phần phân quyền mức bản ghi vẫn truy database cho từng task. Đánh đổi đã biết: khi admin đổi role hoặc nhóm của một người, token cũ của người đó bị cũ tối đa 15 phút. Khoảng cũ này bị giới hạn bởi tuổi thọ access token. Đó cũng chính là lý do access token cần sống ngắn.
- **Khi access token hỏng.** Endpoint cần xác thực gặp Bearer hỏng hoặc hết hạn thì trả 401 `TOKEN_EXPIRED` hoặc `TOKEN_INVALID`. Interceptor ở frontend gọi `/auth/refresh` rồi thử lại đúng một lần. Thử lại vẫn fail thì đưa người dùng về màn hình đăng nhập.
- **Reuse-detection trả 401 trùng với hết hạn.** Không có code riêng cho ca reuse. Đây là chủ đích. Kẻ trộm không biết mình vừa kích hoạt detection. Việc thu hồi cả họ token là xử lý phía server, theo schema mục 8.4. Client chỉ thấy "hết phiên".
- **Throttle.** Theo Giai đoạn 4 mục 8.5. `/auth/login` giới hạn khoảng 5 lần một phút cho mỗi IP. `/auth/refresh` giới hạn khoảng 10 lần một phút. Vượt thì trả 429 `RATE_LIMITED` kèm header `Retry-After`.
- **Cookie attributes.** `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth; Max-Age=7d`. Vì `Path` giới hạn, cookie không gửi kèm `/tasks` hay `/users`. Nhờ vậy call API hoàn toàn nằm ngoài diện cookie và CSRF.

Khớp SEC-02. Cookie chỉ là phương tiện vận chuyển. Quyền lực thu hồi vẫn nằm ở bản ghi trong database, gồm hash SHA-256, familyId, và hai mốc usedAt với revokedAt. Rotation là việc thay cookie sau mỗi lần refresh. Thuật toán reuse-detection giữ nguyên như schema mục 8.4.

---

## 7. Envelope lỗi và code registry

### 7.1. Hình dạng envelope

Giữ đúng hình dạng đã chốt ở Giai đoạn 4 mục 8.1.

```jsonc
{
  "statusCode": 409,
  "error": "Conflict",                   // reason-phrase HTTP, cho người đọc
  "code": "LEADER_REPLACEMENT_REQUIRED", // machine key, đây là phần hợp đồng, frontend rẽ nhánh ở đây
  "message": "Phải chỉ định leader thay trước khi vô hiệu hoá.", // cho người đọc, đổi và dịch tự do
  "timestamp": "2026-06-23T...Z",
  "path": "/api/v1/users/ckx.../deactivate",
  "requestId": "req_ckx..."              // để dò log server cho lỗi 500
}
```

Nguyên tắc khoá: trường `message` không phải hợp đồng. Nó đổi được và dịch được, nên frontend không bao giờ parse nó. Trường `error` gần như trùng với `statusCode`, giữ lại cho dễ đọc log, đừng rẽ nhánh trên nó. Chỉ `code` là hợp đồng ổn định. Trường `requestId` rẻ và là chuẩn production, dùng để dò một lỗi 500 trong log. Khuyến nghị thêm, bỏ cũng được.

### 7.2. Lỗi validation theo từng field

Lỗi 400 thêm một mảng `details`, theo SEC-05 và UX-01.

```jsonc
{
  "statusCode": 400,
  "error": "Bad Request",
  "code": "VALIDATION_FAILED",
  "message": "Dữ liệu không hợp lệ.",
  "details": [
    { "field": "email", "constraint": "phải là email hợp lệ" },
    { "field": "title", "constraint": "không được rỗng" }
  ],
  "timestamp": "...",
  "path": "..."
}
```

Mảng `details` chỉ có ở `VALIDATION_FAILED`. Các lỗi khác không kèm nó. Lớp này là DTO và ValidationPipe ở rìa, theo Giai đoạn 4 mục 8.2. Nó chặn input méo trước khi chạm domain.

### 7.3. Code registry

Bảng này gom mọi `code` rải rác trong các mục trên về một chỗ.

| Nhóm | code | HTTP |
|---|---|---|
| chung | `VALIDATION_FAILED` | 400 |
| chung | `RESOURCE_NOT_FOUND` | 404 |
| chung | `RATE_LIMITED`, kèm `Retry-After` | 429 |
| chung | `INTERNAL_ERROR` | 500 |
| auth | `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `SESSION_EXPIRED` | 401 |
| auth | `ACCOUNT_DISABLED` | 403 |
| task | `NOT_TASK_OWNER`, `NOT_TASK_ASSIGNEE`, `TASK_ASSIGNEE_NOT_IN_TEAM`, `TASK_MEMBER_SELF_ASSIGN_ONLY` | 403 |
| task | `PAST_DEADLINE_CONFIRMATION_REQUIRED` | 400 |
| user và org | `EMAIL_TAKEN`, `TEAM_NAME_TAKEN`, `LEADER_REPLACEMENT_REQUIRED`, `LEADER_ALREADY_EXISTS`, `LEADER_NOT_TEAM_MEMBER`, `CANNOT_DISABLE_SELF`, `LAST_ADMIN`, `TEAM_NOT_EMPTY` | xem mục 7.4 |

Mã 404 dùng code chung là `RESOURCE_NOT_FOUND`, không dùng một code riêng kiểu `TASK_NOT_FOUND_IN_TEAM`. Việc này giữ đúng keystone. Resource ngoài phạm vi thì người gọi không được biết nó là gì. Ngược lại, mã 403 được phép dùng code cụ thể. Vì người gọi đã thấy được resource cùng nhóm, nói rõ "bạn không phải owner" không lộ thêm gì.

### 7.4. Map constraint và luật nghiệp vụ sang HTTP

Bảng này gắn mỗi vi phạm với nguồn enforce ở schema mục 4.

| Vi phạm | Nguồn enforce | code và HTTP | Ghi chú |
|---|---|---|---|
| email trùng | unique ở database | `EMAIL_TAKEN`, 409 | Lúc tạo hoặc sửa user |
| tên nhóm trùng | unique ở database | `TEAM_NAME_TAKEN`, 409 | Lúc tạo nhóm |
| title rỗng | DTO bắt trước | `VALIDATION_FAILED`, 400 | CHECK ở database chỉ là lưới an toàn, nên client không thấy lỗi database |
| giao việc ngoài nhóm | domain | `TASK_ASSIGNEE_NOT_IN_TEAM`, 403 | FR-TASK-01 |
| member giao cho người khác | domain | `TASK_MEMBER_SELF_ASSIGN_ONLY`, 403 | FR-TASK-01 |
| deadline quá khứ, thiếu cờ | domain | `PAST_DEADLINE_CONFIRMATION_REQUIRED`, 400 | Là lỗi mức payload nên trả 400, không phải 409 |
| gán leader thứ hai cho nhóm | domain, có partial unique làm lưới an toàn | `LEADER_ALREADY_EXISTS`, 409 | Domain chặn trước, raw constraint chỉ nổ khi đua nhau |
| vô hiệu hoá leader chưa có người thay | domain | `LEADER_REPLACEMENT_REQUIRED`, 409 | Giai đoạn 4 mục 8.1 đã đặt sẵn tên |
| FK Restrict trên owner, assignee, hoặc team | database | không có ở luồng thường | Xem ghi chú dưới |

Ghi chú về FK Restrict. Ràng buộc này gần như không bao giờ kích hoạt ở luồng thường. Lý do là mọi thao tác xoá đều là xoá mềm, qua `isActive` cho user và `deletedAt` cho task. FK Restrict chỉ có thể nổ ở thao tác xoá cứng của admin, nếu có. Nên nó thuộc nhánh break-glass ở mục 9, không phải một rule envelope chung. Hai map thật sự dùng tới là email trùng và vô hiệu hoá leader chưa có người thay.

### 7.5. Kỷ luật status code

Chỉ dùng 400, 403, và 409 cho ba lớp khác nhau. Không dùng 422. Việc này giữ đúng tập status mà Giai đoạn 4 mục 8.1 đã chấp nhận.

- **400 nghĩa là payload sai hoặc thiếu.** Ví dụ lỗi validation, hoặc thiếu cờ `allowPastDeadline`. Thông điệp ngầm là "sửa request rồi gửi lại".
- **403 nghĩa là thấy được nhưng hành động không phải của bạn.** Ví dụ sai owner, sai assignee, sai vai trò, hoặc ngoài phạm vi. Thông điệp ngầm là "request đúng, nhưng bạn không có quyền".
- **409 nghĩa là xung đột với trạng thái hiện tại.** Ví dụ trùng giá trị unique, hoặc cần thay leader trước. Thông điệp ngầm là "request đúng, nhưng trạng thái không cho".

Mã 422 cố tình bị loại. Không thêm một trục code thứ tư bắt người đọc phải học. Đây là tinh thần chống over-engineer.

Mã 500 dùng code chung `INTERNAL_ERROR` kèm `requestId`. Nó không kèm `details`, không kèm stack trace, theo UX-01. Một exception filter toàn cục, theo Giai đoạn 4 mục 8.1, log đầy đủ phía server. Client chỉ thấy "có lỗi, thử lại".

---

## 8. Request DTO và projection response

### 8.1. Request DTO

Nguyên tắc xuyên suốt: field do server suy ra thì không bao giờ nằm trong body. Đây là cách chống mass-assignment và IDOR. `ownerId` lấy từ `sub` trong JWT. Phạm vi lấy từ `teamId` trong JWT. Các field `overdue`, `createdAt`, `id` đều do server sinh. Client chỉ gửi cái nó được phép định đoạt.

Validation trong bảng dưới là validation hình thức, đặt ở DTO. Luật nghiệp vụ đặt ở domain, được trỏ tên ở cột policy và sẽ thực thi ở Giai đoạn 7.

| Endpoint | Body | Server suy ra | Policy cần thoả |
|---|---|---|---|
| `POST /tasks` | `{ title*, description?, deadline?, assigneeId*, allowPastDeadline? }`; title trim khác rỗng và tối đa 200; description tối đa 2000; deadline là ISO hoặc null; assigneeId là cuid2 | owner bằng người gọi | member thì assigneeId bằng chính mình; leader thì assignee thuộc nhóm; deadline quá khứ thì cần cờ |
| `PATCH /tasks/:id` | `{ title?, description?, deadline? }`; ít nhất một field; cùng rule độ dài | không có | `NOT_TASK_OWNER`; deadline quá khứ cần cờ |
| `PATCH /tasks/:id/progress` | `{ progress* }`, là enum | không có | `NOT_TASK_ASSIGNEE`; không có máy trạng thái, theo schema mục 4.3 |
| `PATCH /tasks/:id/assignee` | `{ assigneeId* }`, là cuid2 | không có | leader của nhóm; assignee thuộc nhóm và đang hoạt động |
| `POST /users` | `{ email*, name*, password*, role*, teamId? }`; email đúng định dạng; password theo chính sách; role là enum | không có | admin thì teamId vắng; leader hoặc member thì teamId có, đây là CHECK đưa lên DTO |
| `PATCH /users/:id` | `{ name? }`, chỉ tên | không có | teamId và role bất biến, chốt ở mục 9 |
| `POST /teams` | `{ name* }`, trim khác rỗng | không có | `TEAM_NAME_TAKEN` |
| `PUT /teams/:id/leader` | `{ userId* }` | không có | userId thuộc nhóm và đang hoạt động; đổi atomic |

Một chi tiết của `POST /tasks`. Field `assigneeId` để required cho cả member lẫn leader, thay vì để optional rồi mặc định là chính mình. Lý do là giữ một hình dạng request duy nhất, và backend luôn là nơi quyết định. Member gửi đúng id của mình, gửi sai thì nhận 403. Đánh đổi là member phải gửi id của chính mình, việc này nhỏ vì frontend đã có sẵn id từ `/auth/me`.

### 8.2. Projection response

Một luật duy nhất: response là một phép chiếu, không phải model. Mặc định là từ chối. Chỉ field được khai báo mới lộ ra.

- **Không bao giờ serialize.** Gồm `passwordHash`, `tokenHash`, mọi field của RefreshToken, và `Task.deletedAt`.
- **Task.** Hình dạng là `{ id, title, description, progress, deadline, overdue, owner, assignee, createdAt, updatedAt }`. Field `overdue` là computed. Hai field `owner` và `assignee` là projection lồng, chỉ gồm `{ id, name }`, không nhả toàn bộ user.
- **User.** Hình dạng là `{ id, email, name, role, teamId, isActive, createdAt }`. Field `teamId` của chính người đó không nhạy cảm nên lộ được.

### 8.3. Quy ước casing và format

Nhắc lại từ mục 1 cho gọn. Tất cả là camelCase. Thời gian là chuỗi ISO-8601 ở UTC. ID là cuid2 dạng opaque. Giá trị enum trong JSON giữ y nguyên enum của database. Không có lớp dịch giữa frontend và backend.

---

## 9. Admin và break-glass

Việc đầu tiên là vạch sắc ranh giới giữa thao tác routine và thao tác break-glass. Gộp hai loại lại chính là cái bẫy mà Giai đoạn 4 mục 5 cảnh báo, đó là biến admin thành một super-manager ngầm.

### 9.1. Routine so với break-glass

- **Routine, thuộc trục chức năng.** Admin quản user và team của chính cấu trúc tổ chức. Ví dụ tạo user, gán leader, vô hiệu hoá user. Guard là vai trò admin. Phạm vi là toàn hệ thống. Không ghi log break-glass. Ở đây admin vẫn không chạm vào dữ liệu task.
- **Break-glass, là cứu hộ.** Admin với tay vào chỗ vốn bị chặn, ví dụ dữ liệu task hoặc việc giải thể nhóm. Thao tác này có tính phá huỷ hoặc vượt invariant. Mỗi lần gọi đều ghi một dòng log ứng dụng gồm actor, action, target, và thời điểm, ra stdout. Đây là mầm của một audit-log đầy đủ ở phiên bản portfolio, theo MAINT-05. Nó không phải audit-log.

Phần lớn mục này là routine. Break-glass thật trong bản nộp cố tình mỏng. Giá trị của nó là cái seam để sẵn cộng với quy ước ghi log, không phải một bảng điều khiển toàn quyền. Ở đây "seam" nghĩa là một đường cắt để sẵn, hoãn được, thêm sau mà không phải mổ lại lõi.

### 9.2. Surface routine

| Endpoint | DTO và ghi chú | Lỗi đặc thù |
|---|---|---|
| `POST /users` | `{ email, name, password, role, teamId? }`, mật khẩu tạm theo FR-AUTH-01 | `EMAIL_TAKEN` 409, `VALIDATION_FAILED` 400 |
| `GET /users` | List, lọc theo `role`, `teamId`, `includeInactive`, có phân trang | không có |
| `GET /users/:id` và `PATCH /users/:id` | Sửa hồ sơ, chỉ field name, không sửa teamId hay role | không có |
| `POST /users/:id/deactivate` | Xoá mềm, set `isActive` bằng false | `LEADER_REPLACEMENT_REQUIRED` 409 |
| `POST /users/:id/reactivate` | Set `isActive` bằng true, là un-disable chứ không phải un-delete | không có |
| `POST /teams`, `GET /teams`, `GET /teams/:id`, `PATCH /teams/:id` | Tạo, list, xem, đổi tên | `TEAM_NAME_TAKEN` 409 |
| `PUT /teams/:id/leader` | Đặt leader của nhóm, đổi atomic | `LEADER_NOT_TEAM_MEMBER` 400 |

Một endpoint roster, không phải admin-only, phạm vi do server suy ra. Nó đóng khoảng trống là leader cần danh sách thành viên để giao việc.

| `GET /teams/:id/members` | List member đang hoạt động của chính nhóm mình | Nhóm khác trả 404, do bị chặn phạm vi |

Validation lúc tạo user map CHECK "admin thì không có nhóm, leader và member thì phải có nhóm" lên DTO, cùng kiểu với rule title không rỗng. Nếu `role` là `ADMIN` thì teamId phải vắng. Nếu `role` là `LEADER` hoặc `MEMBER` thì teamId bắt buộc. Sai thì trả 400. Tạo thẳng một user `role=LEADER` chỉ được khi nhóm chưa có leader. Nhóm đã có leader thì trả 409 `LEADER_ALREADY_EXISTS`, và buộc dùng `PUT /teams/:id/leader`.

### 9.3. Ba endpoint có máu

**`PUT /teams/:id/leader` gộp ba yêu cầu vào một.** Tính chất "đúng một leader" thuộc về team, nên một thao tác PUT đặt giá trị singleton đọc đúng nghĩa hơn là một PATCH đổi role của user. Body là `{ userId }`, và userId phải là một member đang hoạt động của nhóm. Server làm atomic, gồm demote leader cũ thành MEMBER và promote người mới, theo schema mục 4.4.

Cái đẹp của endpoint này là nó cũng là lời giải cho việc chặn vô hiệu hoá leader. Muốn vô hiệu hoá một leader, trước hết gọi `PUT leader` để chuyển ghế sang người khác. Leader cũ tự thành MEMBER. Sau đó mới vô hiệu hoá. Chỉ một endpoint, không cần nhánh đặc biệt.

> Đây là lý do không cho sửa `role` tự do qua `PATCH /users/:id`. Mọi chuyển đổi giữa LEADER và MEMBER chỉ xảy ra như hệ quả của việc đặt leader, không bao giờ là một lệnh trực tiếp. Nhờ vậy không có cách nào tạo trạng thái 0 leader hay 2 leader từ hợp đồng.

**`POST /users/:id/deactivate` đóng ca FR-USER-01.** Khi đối tượng là member, trả 200 kèm `orphanedTaskCount`, để admin thấy ngay trên giao diện. Đồng thời phát một thông báo qua port `Notifier`, là `NoopNotifier` ở bản nộp và `EmailNotifier` ở portfolio, để báo leader. Task treo giữ nguyên `assigneeId` nên phạm vi vẫn ổn, và task nằm lại trong nhóm. Leader tìm chúng bằng `GET /tasks?assigneeId=<member>` rồi reassign bằng `PATCH /tasks/:id/assignee`, vốn là quyền của leader theo keystone. Khi đối tượng là leader thì trả 409, không phát thông báo gì.

```jsonc
// POST /users/:id/deactivate khi đối tượng là member
200 {
  "user": { "id": "...", "isActive": false },
  "orphanedTaskCount": 3       // chính là "báo leader N task treo"
}
```

Hai edge nên chặn để xứng production. Không cho admin vô hiệu hoá chính mình. Không cho vô hiệu hoá admin cuối cùng. Hai ca này trả 409 `CANNOT_DISABLE_SELF` và `LAST_ADMIN`. Việc này chống tự khoá hệ thống, và rất rẻ.

### 9.4. Break-glass trong bản nộp

Bản nộp có đúng một endpoint break-glass, để demo cái seam.

| Endpoint | Hành vi | Lỗi |
|---|---|---|
| `DELETE /teams/:id` | Giải thể nhóm, trả 204 nếu nhóm rỗng | 409 `TEAM_NOT_EMPTY` nếu còn member |

Đây là chỗ FK Restrict thật sự kích hoạt, do ràng buộc `User.teamId` trỏ `Team` ở schema mục 4.2. Việc này đóng nốt ghi chú ở mục 7.4. FK Restrict chỉ nổ ở đây, không nổ ở luồng thường. Muốn giải thể, admin phải dọn hết member trước. Vì hệ thống không hỗ trợ chuyển nhóm, dọn ở đây thực tế là vô hiệu hoá hết member. Thao tác này đa bước và có tính phá huỷ, nên đúng diện break-glass kèm log.

Log thể hiện trong hợp đồng thế nào. Log là một side-effect nên không phải một field trong response. Nó là một hành vi được khai báo. Phần mô tả của endpoint trong OpenAPI ghi cảnh báo là endpoint này ghi một dòng log ứng dụng gồm actor, action, target, thời điểm, và nó nằm ngoài policy thường. Đó là cách một side-effect xuất hiện trong hợp đồng ở Giai đoạn 6.

Cố tình không có trong bản nộp: admin sửa task tuỳ ý, và các thao tác chỉnh dữ liệu tổng quát. Hai thứ này để dành portfolio. Xây chúng bây giờ đúng là tạo ra super-manager ngầm mà mục 5 cảnh báo. Cái seam, gồm một nhánh chỉ-admin cộng một interceptor ghi log, đã đủ để chứng minh.

### 9.5. Nhóm và vai trò bất biến sau khi tạo

FR-USER-02 viết "gán nhóm và vai trò", và có thể bị đọc thành admin được đổi teamId hoặc role sau khi tạo. Quyết định ở đây là teamId của một user bất biến sau khi tạo. User chỉ được tạo và vô hiệu hoá. Role chỉ đổi qua leader-swap. Lý do truy thẳng về spine.

- Giai đoạn 1 mục 5.4 và FR-USER-01 chốt rằng phạm vi được bảo toàn vì user chỉ bị xoá mềm. Câu này ngầm giả định nhóm của user không đổi.
- Nếu cho admin chuyển một user sang nhóm khác thì có hai hệ quả xấu. Một là các task được giao cho người đó âm thầm đổi phạm vi. Hai là các task người đó làm owner cho người khác sẽ vi phạm invariant "nhóm của owner bằng nhóm của assignee", theo schema mục 3.
- Cấm chuyển nhóm thì giữ được hai invariant này, và surface gọn hơn vì không có endpoint chuyển nhóm. Việc chuyển nhóm thật sự là một thao tác chỉnh dữ liệu, nên thuộc break-glass ở portfolio, không phải routine.

> Quyết định này tự đóng một edge khác. Một user lúc bị vô hiệu hoá thì luôn đã là MEMBER. Lý do là muốn vô hiệu hoá một leader thì phải swap trước, và leader cũ tự thành MEMBER. Nên `reactivate` trả người đó về MEMBER, không bao giờ đụng vào partial unique trên LEADER. Spine tự nhất quán, không cần thêm luật.

---

## 10. Soft-delete và bảng status tổng

| Thao tác | Code | Body |
|---|---|---|
| `DELETE /tasks/:id`, xoá mềm, owner | 204 | Không. `GET` sau đó trả 404 vì task rớt khỏi phạm vi. Không có un-delete vì đây là tombstone. |
| `POST /users/:id/deactivate` | 200 | `{ user, orphanedTaskCount }` |
| `POST /users/:id/reactivate` | 200 | `{ user }` |
| `DELETE /teams/:id`, break-glass | 204 nếu rỗng, 409 nếu còn member | Không |
| `POST /auth/logout` | 204 | Không |

Kỷ luật: 204 dành cho thao tác đổi trạng thái mà không cần trả thân, ví dụ xoá task và logout. 200 kèm body dành cho thao tác cần trả về trạng thái mới, ví dụ deactivate trả về số task treo. Quy ước này áp cho toàn surface.

Bảng status tổng dưới đây khoá toàn bộ Giai đoạn 6. Đây là toàn bộ trục code mà frontend phải học.

| HTTP | Nghĩa | Ví dụ code |
|---|---|---|
| 200, 201, 204 | OK, đã tạo, không có thân | không có |
| 400 | Payload sai hoặc thiếu | `VALIDATION_FAILED`, `PAST_DEADLINE_CONFIRMATION_REQUIRED`, `LEADER_NOT_TEAM_MEMBER` |
| 401 | Chưa xác thực | `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `SESSION_EXPIRED` |
| 403 | Thấy được nhưng không được phép | `NOT_TASK_OWNER`, `NOT_TASK_ASSIGNEE`, `TASK_ASSIGNEE_NOT_IN_TEAM`, `ACCOUNT_DISABLED` |
| 404 | Ngoài phạm vi hoặc không tồn tại, dùng code chung | `RESOURCE_NOT_FOUND` |
| 409 | Xung đột trạng thái | `EMAIL_TAKEN`, `TEAM_NAME_TAKEN`, `LEADER_REPLACEMENT_REQUIRED`, `LEADER_ALREADY_EXISTS`, `TEAM_NOT_EMPTY`, `CANNOT_DISABLE_SELF`, `LAST_ADMIN` |
| 429 | Bị throttle | `RATE_LIMITED` |
| 500 | Lỗi nội bộ, dùng code chung kèm requestId | `INTERNAL_ERROR` |

Không có 422. Không có status nào ngoài bảng.

---

## 11. OpenAPI và Swagger

Cần chỉnh lại framing so với sườn ban đầu. Nguồn sự thật mà người ta author là DTO cộng decorator, và phần đó Giai đoạn 7 viết. Swagger là bản được sinh ra từ chúng. Tài liệu Giai đoạn 6 này là spec làm input cho cả hai. Không viết tay file YAML.

`@nestjs/swagger` quét các decorator rồi sinh ra một spec sống, phục vụ tại `/api/v1/docs`. Việc này phục vụ DOC-01.

Các quyết định setup.

- **Envelope lỗi dùng lại một lần.** Khai báo envelope là một model qua `@ApiExtraModels`, rồi dùng lại ở mọi endpoint. Nhờ vậy hình dạng lỗi chỉ xuất hiện một chỗ và luôn nhất quán. Phần mô tả kèm theo code registry, vì frontend cần đọc.
- **Nút Authorize cho access token.** Đăng ký scheme bằng `@ApiBearerAuth`, để nút Authorize trong giao diện Swagger gắn được access token và gọi thử được. Refresh cookie không test được qua Swagger vì nó là httpOnly. Ghi chú điều này, và demo luồng refresh bằng curl hoặc bằng frontend.
- **Bắt buộc có example ở bốn chỗ khó.** Bốn chỗ này không map một-một với model, nên chúng đúng là chỗ cần chứng minh hình dạng hợp đồng khác hình dạng model. Đó là cờ `overdue` trong task, hình dạng stats ở mục 5, mảng `details` của lỗi validation, và envelope lỗi. Dùng `@ApiProperty` tường minh cho field computed và field lồng.
- **Tags gom theo context.** Gồm auth, tasks, users, teams, stats.
- **Endpoint break-glass.** Phần mô tả gắn cảnh báo là endpoint này ghi một dòng log ứng dụng gồm actor, action, target, thời điểm. Đây là cách side-effect log hiện trong hợp đồng.
- **Cổng prod.** Chuẩn production là ẩn Swagger sau một cờ môi trường. Với đồ án này thì để mở, vì người chấm cần truy cập. README cần nói rõ đây là một lựa chọn để demo, không phải mặc định cho prod. Việc nói rõ này là một tín hiệu cho thấy biết cái gì không nên hở ở prod.

> Spec này cộng toàn bộ tài liệu Giai đoạn 6 là input đông cứng cho Giai đoạn 7. Mỗi endpoint đã có verb, path, DTO, code, và policy cần thoả. Giai đoạn 7 chỉ hiện thực guard, policy, và use-case đã được trỏ tên, không phát minh thêm hợp đồng.

---

## 12. Truy vết và bước tiếp theo

### 12.1. Bảng truy vết yêu cầu sang hợp đồng

| Yêu cầu | Map vào hợp đồng |
|---|---|
| FR-AUTH-02 | `POST /auth/login`, thứ tự kiểm tra ở mục 6.3, 401 chung cộng 403 cho tài khoản bị khoá |
| FR-AUTH-03 | `POST /auth/refresh`, rotation, reuse-detection trả 401 trùng hết hạn |
| FR-AUTH-04 | `POST /auth/logout`, trả 204, thu hồi token và xoá cookie |
| FR-USER-01 | `POST /users/:id/deactivate`, trả `orphanedTaskCount`, leader reassign qua `PATCH /tasks/:id/assignee` |
| FR-USER-02 | `PUT /teams/:id/leader`, nhóm và role bất biến ở mục 9.5 |
| FR-TASK-01 | `POST /tasks`, validation cờ deadline quá khứ, luật giao trong nhóm |
| FR-TASK-02 | `PATCH /tasks/:id/progress`, chỉ assignee |
| FR-TASK-03 | `PATCH /tasks/:id` và `DELETE /tasks/:id`, chỉ owner |
| FR-TASK-04 | `GET /tasks`, query param ở mục 4.1, phạm vi suy ra, IDOR ở keystone |
| FR-TASK-05 | Trục `overdue`, computed field, dùng chung mốc `now` |
| FR-DASH-01 | `GET /stats`, hình dạng ép OVERDUE không thành bucket thứ tư |
| SEC-02 | Token ở mục 6, rotation, store dùng chung |
| SEC-03 và SEC-04 | guard cộng policy mức bản ghi, khai báo ở keystone |
| SEC-05 | DTO và ValidationPipe ở rìa, lỗi field-level ở mục 7.2 |
| PERF-02 và PERF-03 | Phân trang ở tầng DB, trần limit, trả total |
| DOC-01 | OpenAPI sinh từ decorator ở mục 11 |

### 12.2. Những chỗ quyết định ở nơi spec để ngỏ

Hai quyết định dưới đây nằm ở chỗ Giai đoạn 1 và 2 để ngỏ hoặc nói chưa chặt. Cả hai đã được xác nhận trong lúc chốt.

- **Nhóm bất biến, role chỉ qua leader-swap.** Bảo vệ invariant phạm vi suy ra. Lý do ở mục 9.5.
- **IDOR chọn 404 thay vì 403 cho resource ngoài nhóm.** FR-TASK-04 để ngỏ giữa 403 và 404. Quyết định ở đây chọn hướng giấu sự tồn tại.

### 12.3. Bàn giao cho Giai đoạn 7

Tài liệu này là hợp đồng đông cứng. Giai đoạn 7 hiện thực phần đã được trỏ tên. Gồm guard vai trò, policy mức bản ghi `TaskPolicy`, các use-case ghi và đọc, thuật toán rotation và reuse-detection, và adapter Prisma map domain sang persistence. Không quyết định nào ở đây cản đường Giai đoạn 7.

> Ghi chú phương pháp: tài liệu cố tình ghi lựa chọn, đánh đổi, và lý do cho từng quyết định lớn. Ví dụ tách endpoint theo chủ thể thay vì field-level authz, chọn 404 cho IDOR, để refresh token trong cookie thay vì localStorage, và loại 422 khỏi tập status. Đây là phần để bảo vệ trước giảng viên và để kể chuyện khi phỏng vấn. Đặc biệt cho câu hỏi làm sao thiết kế một hợp đồng vừa chặn được IDOR và mass-assignment, vừa không over-engineer ở một đồ án 23 ngày.
