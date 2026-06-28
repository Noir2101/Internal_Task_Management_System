---
description: Sau khi /check-spine xanh, xét cập nhật docs/CLAUDE.md (default KHÔNG sửa) và ghi deviations-log/implementation-log nếu khớp (append-only). Chỉ sửa spine khi khớp đúng tiêu chí.
---

Bước vừa code xong và `/check-spine` đã xanh. Xét xem có cần cập nhật tài liệu trước khi commit không.
**Mặc định là KHÔNG sửa gì.** Chỉ sửa khi khớp đúng một tiêu chí dưới đây — đừng "dọn dẹp" hay tổng kết phiên.

## docs/00 tới docs/06 — agent KHÔNG tự sửa

Đây là spine đã đông cứng từ trước GĐ7. Agent KHÔNG bao giờ tự sửa các file này. Hai ca, phân biệt rõ:

- **Lỗi thật trong spine** (mâu thuẫn nội tại, sai logic) → KHÔNG tự sửa. Báo người, trích đúng đoạn
  mâu thuẫn, và dừng.
- **GĐ7 cần BỔ SUNG một phần FE-observable mà spine chưa liệt kê** (code lỗi mới, status mới, field
  shape mới mà hệ SẼ phát ra — vd `FORBIDDEN` cho role-deny ở Bước 3) → vẫn KHÔNG tự sửa docs/06. Ghi
  `deviations-log` NGAY với `Loại: chờ-bổ-sung-spine → docs/06 §X, Bước N`. Khi phần đó GO-LIVE
  (endpoint thật phát code), NGƯỜI duyệt một amendment có-đánh-dấu vào docs/06 — vì registry §7.3 phải
  đầy đủ (FE rẽ nhánh CHỈ trên `code`); để hệ emit một code mà registry thiếu = hợp đồng tự mâu thuẫn.

Việc code GĐ7 không bao giờ là lý do để agent tự đổi những file này.

## CLAUDE.md (root) — sửa CHỈ KHI

- Một **bất biến mới** lộ ra trong lúc code mà chưa có trong checklist (ví dụ một luật authz
  ngầm định mà hợp đồng nói nhưng checklist quên ghi). Thêm đúng một dòng vào nhóm bất biến phù hợp,
  gắn nhãn [GATE] hoặc [REVIEW] cho đúng.
- Bước build vừa xong đổi trạng thái cần phản ánh (ví dụ bước 1 xong, để session sau biết bắt đầu
  từ bước 2). Sửa tối thiểu, không viết lại mục.
- Một quyết định triển khai-tầng-cao mới phát sinh và ảnh hưởng mọi module sau (ví dụ chọn
  argon2 cho hashing — đã có sẵn, ví dụ tương lai: đổi thư viện validation toàn cục).

KHÔNG sửa vì: refactor nội bộ, đổi tên file/biến, chi tiết implement không rò ra ngoài module,
một quyết định chỉ ảnh hưởng một file.

## src/tasks/CLAUDE.md — sửa CHỈ KHI

Luật hexagonal *bản thân* đổi: thêm một port mới, đổi ranh giới tầng, thêm một use-case làm lộ
một luật authz chưa từng ghi. KHÔNG sửa vì thêm một file thường trong domain/application/infrastructure
mà không đổi luật.

## docs/07-build-plan.md — sửa CHỈ KHI

Một **quyết định kiến trúc mới** được chốt giữa đường mà đáng có lý do ghi lại, cùng tầm với các
quyết định đã có trong doc (ví dụ đổi thư viện projection, đổi cách bơm Clock). Thêm đúng một mục
ngắn theo đúng giọng của doc (lý do + đánh đổi), KHÔNG viết lại mục đã có trừ khi nó sai.

## docs/deviations-log.md + docs/implementation-log.md — GHI khi khớp (append-only)

Khác bốn mục trên (default KHÔNG sửa spine), hai log này là **truy vết append-only** — default là
**GHI nếu khớp**, không phải để trống. Theo đúng format có sẵn trong mỗi file; không cần hỏi trước
khi thêm entry (đây là ghi nhận, không phải đổi hợp đồng).

- **deviations-log.md** — khi bước vừa xong gặp chỗ hợp đồng (docs/00–06) **im lặng** mà code phải
  chọn một giá trị cụ thể để chạy được (tên biến, gate theo NODE_ENV, hành vi edge-case spine không
  nói). Nếu quyết định có hạn đóng (một bước sau phải quay lại), ghi "đóng ở Bước N" + cân nhắc một
  dòng nhắc trong `CLAUDE.md` ở bước đó nếu rủi ro quên cao.
- **implementation-log.md** — khi verify/test bắt được một **bug thật** có nguyên nhân gốc đáng nhớ
  (race condition, sai tầng, nhầm transaction semantics, off-by-one), hoặc một quyết định kỹ thuật
  không hiển nhiên từ diff.
- **KHÔNG ghi:** lỗi cú pháp/lint vụn, refactor không đổi hành vi, hay quyết định đã có sẵn trong
  CLAUDE.md/docs (ghi lại cái đã rõ là nhiễu). Không có gì khớp → nói "không có entry mới", đừng tạo
  entry rỗng cho có.

## Việc phải làm

1. **Spine + CLAUDE.md (bốn mục đầu):** bước vừa xong có khớp đúng MỘT tiêu chí "sửa CHỈ KHI" không?
   - Không khớp → báo "Không cần cập nhật spine" rồi sang bước 2. Đây là kết quả phổ biến nhất.
   - Khớp → liệt kê CHÍNH XÁC tiêu chí nào, file nào, đoạn dự định (ngắn nhất). **Hỏi người xác nhận
     trước khi sửa** — đừng tự sửa rồi báo sau.
2. **Hai log (append-only):** rà theo tiêu chí mục trên. Khớp → thêm entry theo format (không cần
   hỏi). Không khớp → nói "không có entry mới".
3. Nếu sửa `CLAUDE.md`, không thêm prose mới ngoài đúng dòng/mục cần — file này đọc mỗi lượt,
   phình ra là loãng attention của mọi phiên sau.
