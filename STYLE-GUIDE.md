# Style Guide — Tài liệu kỹ thuật dự án (tiếng Việt)

> Attach file này vào đầu mỗi session khi nhờ Claude viết hoặc sửa tài liệu kỹ thuật cho dự án. Mục tiêu: tài liệu chính xác về kỹ thuật nhưng đọc trôi chảy cho người có chuyên môn vừa phải, không bị "cà giựt".

## 1. Nguyên tắc cốt lõi

Giữ nguyên độ chính xác và độ sâu kỹ thuật của nội dung. Chỉ thay đổi **cách trình bày** để cùng lượng thông tin đó đi vào đầu người đọc mượt hơn. Không cắt ý, không làm loãng lập luận.

## 2. Quy tắc thuật ngữ tiếng Anh

- **Neo nghĩa ở lần xuất hiện đầu tiên.** Lần đầu một thuật ngữ Anh xuất hiện trong thân bài, viết kèm giải nghĩa Việt ngắn trong ngoặc: `port (cổng giao tiếp trừu tượng)`, `IDOR (lỗ hổng đổi ID để truy cập dữ liệu của người khác)`. Sau đó dùng thẳng từ tiếng Anh.
- **Cân nhắc một bảng thuật ngữ** ở đầu file nếu document có nhiều hơn ~6 thuật ngữ lặp lại. Khi đã có bảng, thân bài vẫn neo lần đầu nhưng có thể gọn hơn.
- **Một khái niệm, một nhãn.** Trong toàn document, chọn một cách gọi và giữ nguyên. Không lúc "phân quyền" lúc "authz", không lúc "tầng" lúc "layer". Nếu phải chọn, ưu tiên từ đã neo ở bảng thuật ngữ.
- **Giữ nguyên các từ không nên dịch:** tên công nghệ (NestJS, Prisma, Postgres), tên kiểu dữ liệu (`timestamptz`, `jsonb`), tên pattern phổ biến (DTO, JWT, CRUD, ORM, API), tên định danh trong code. Không cố Việt hoá những thứ này.

## 3. Quy tắc câu và đoạn

- **Mỗi câu một ý chính.** Nếu một câu có nhiều hơn một mệnh đề giải thích, tách mệnh đề phụ thành câu riêng.
- **Không nhồi mệnh đề chèn.** Tránh ngoặc đơn lồng trong ngoặc đơn, tránh chuỗi gạch ngang giữa câu. Một câu nên có tối đa một cặp dấu chèn.
- **Hạn chế ký hiệu trong văn xuôi.** Các ký hiệu `→`, `←`, `×`, `≠`, `≥` chỉ dùng trong bảng, sơ đồ ASCII, công thức, hoặc code block. Trong câu kể, viết bằng chữ: "khác" thay cho `≠`, "nhân với" hoặc "kết hợp với" thay cho `×`, "dẫn tới" hoặc "nên" thay cho `→`.
- **Đoạn ngắn.** Một đoạn văn xuôi nên dưới ~4 câu. Ý dài thì tách đoạn hoặc chuyển sang gạch đầu dòng.

## 4. Đặc ngữ riêng của dự án

Dự án dùng một số từ ẩn dụ đắt giá, nên giữ: "đi sâu", "rìa so với lõi", "đòn bẩy không giáo điều", "seam / đường cắt để sẵn", "vân gỗ của framework".

- **Mỗi một lần.** Lần đầu mỗi đặc ngữ xuất hiện, định nghĩa gọn ngay tại chỗ trước khi dùng tự do. Ví dụ: *"Phân biệt 'gắn ở rìa' (hoãn được, thêm sau không sửa lõi) với 'ăn vào lõi' (phải đúng từ đầu)."*

## 5. Định dạng

- **Bảng** cho mọi so sánh nhiều chiều (đánh đổi giữa các option, ánh xạ NFR sang quyết định). Đừng diễn so sánh thành văn xuôi dài.
- **Gạch đầu dòng** cho danh sách rời rạc. Nếu mỗi mục có một nhãn dẫn, in đậm nhãn đó: `- **Nghiệp vụ:** ...`.
- **Block quote** (`>`) cho ghi chú phương pháp, lưu ý kể chuyện, hoặc câu chốt cần nổi bật.
- **Code block** cho sơ đồ ASCII, ví dụ code, luồng xử lý. Không vẽ sơ đồ bằng cách xuống dòng trong văn xuôi.
- **In đậm có tiết chế.** Chỉ bôi đậm câu chốt hoặc thuật ngữ lần đầu. Đậm quá nhiều thì mất tác dụng nhấn mạnh.

## 6. Giữ nguyên những gì vốn tốt

Phong cách "ghi rõ lý do và đánh đổi cho mọi quyết định" là điểm mạnh của tài liệu, giữ nguyên. Mục tiêu của style guide này không phải làm tài liệu ngắn hơn hay đơn giản hơn về mặt nội dung, mà là làm nó **dễ đọc tuyến tính hơn**.

## 7. Câu nhắc gọn để dán vào prompt

> Viết/sửa tài liệu theo style guide đính kèm: neo nghĩa Việt cho mọi thuật ngữ Anh ở lần đầu; một khái niệm dùng một nhãn nhất quán; mỗi câu một ý, không nhồi mệnh đề chèn; ký hiệu (→, ←, ×, ≠) chỉ dùng trong bảng/sơ đồ/code, văn xuôi viết bằng chữ; mỗi đặc ngữ dự án một lần trước khi dùng tự do. Giữ nguyên độ chính xác kỹ thuật và phần lý do/đánh đổi.
