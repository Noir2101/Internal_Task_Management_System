---
description: Sau khi /check-spine xanh, tự xét xem bước vừa xong có cần cập nhật docs/CLAUDE.md không. Mặc định KHÔNG sửa; chỉ sửa khi khớp đúng tiêu chí.
---

Bước vừa code xong và `/check-spine` đã xanh. Xét xem có cần cập nhật tài liệu trước khi commit không.
**Mặc định là KHÔNG sửa gì.** Chỉ sửa khi khớp đúng một tiêu chí dưới đây — đừng "dọn dẹp" hay tổng kết phiên.

## docs/00 tới docs/06 — KHÔNG đụng

Đây là spine đã đông cứng từ trước GĐ7. Chỉ sửa nếu bạn phát hiện một **lỗi thật** (mâu thuẫn nội tại,
sai logic) — và trong trường hợp đó, KHÔNG tự sửa. Báo cho người, trích đúng đoạn mâu thuẫn,
và dừng. Việc code GĐ7 không bao giờ là lý do để đổi những file này.

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

## Việc phải làm

1. Tự hỏi: bước vừa xong có khớp đúng MỘT tiêu chí "sửa CHỈ KHI" nào ở trên không?
   - Không khớp tiêu chí nào → báo "Không cần cập nhật tài liệu" và dừng. Đây là kết quả phổ biến nhất.
   - Khớp → liệt kê CHÍNH XÁC tiêu chí nào khớp, file nào, và đoạn dự định thêm/sửa (ngắn nhất có thể).
2. Nếu khớp, hỏi người xác nhận trước khi sửa file — đừng tự sửa rồi báo sau.
3. Nếu sửa `CLAUDE.md`, không thêm prose mới ngoài đúng dòng/mục cần — file này đọc mỗi lượt,
   phình ra là loãng attention của mọi phiên sau.
