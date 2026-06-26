# Phụ lục hợp đồng — quyết định ở chỗ spine để ngỏ

> File này KHÔNG sửa lại GĐ1–6 hay `CLAUDE.md`. Nó ghi những chỗ hợp đồng **im lặng**, mà
> lúc code phải quyết một giá trị cụ thể để chạy được. Mỗi entry đã được duyệt qua `/check-spine`
> hoặc qua plan-mode review trước khi commit — đây là truy vết, không phải đề xuất.
>
> Khi đọc lại code và thấy "tại sao chỗ này làm vậy mà sáu doc không nói" — tra ở đây trước khi
> nghi là bug.

Quy ước mỗi entry:

```
### <tiêu đề ngắn>
- Trạng thái: mở | đã đóng (đóng ở Bước N, ngày ...)
- Vị trí: file:line
- Hợp đồng nói gì: ...
- Quyết định: ...
- Lý do: ...
```

---

### `GET /health` — vị trí so với prefix + shape response (Bước 1)
- Trạng thái: mở (endpoint hạ tầng, ngoài surface hợp đồng — không có hạn đóng)
- Vị trí: src/health/health.controller.ts:14
- Hợp đồng nói gì: docs/06 không liệt kê `/health` — nó là endpoint hạ tầng, ngoài contract surface.
- Quyết định: đặt DƯỚI prefix → `GET /api/v1/health`; thành công trả `200 {status:'ok'}`; DB lỗi để exception filter trả `500 INTERNAL_ERROR` + requestId.
- Lý do: giữ một luật "mọi route dưới /api/v1" (khỏi cấu hình setGlobalPrefix exclude); hiện cùng chỗ với mọi route trên Swagger. Đã review với người lúc plan Bước 1.

---

### Cookie `Secure` gate theo `NODE_ENV` (Bước 2)
- Trạng thái: mở (không có hạn đóng — prod luôn set Secure)
- Vị trí: src/auth/refresh-cookie.ts:13
- Hợp đồng nói gì: §6.4 liệt kê thuộc tính cookie `Secure` (literal, không điều kiện).
- Quyết định: `secure: process.env.NODE_ENV === 'production'` — prod set Secure; dev (http://localhost) bỏ Secure.
- Lý do: cookie `Secure` không gửi qua http → refresh gãy ở dev local. Hành vi prod khớp đúng §6.4; chỉ nới ở dev. Duyệt ở plan Bước 2.

---

### `POST /auth/refresh` không chặn user `isActive=false` (Bước 2)
- Trạng thái: mở (đóng ở Bước 5 — luồng deactivate thu hồi refresh token của user)
- Vị trí: src/auth/auth.service.ts:110
- Hợp đồng nói gì: §6.2 chỉ liệt kê 200 + SESSION_EXPIRED cho refresh; im lặng về isActive.
- Quyết định: refresh KHÔNG kiểm isActive; chỉ map lỗi token → SESSION_EXPIRED.
- Lý do: theo mô hình staleness ≤ access TTL (§6.4) — đổi trạng thái lan trong ≤15m. Điểm enforce đúng là lúc deactivate (revoke refresh token + cả family) ở Bước 5. Thêm nhánh isActive ở refresh giờ sẽ phải đẻ một code không có trong registry.

---

### Tên biến .env cho JWT/refresh (Bước 2)
- Trạng thái: mở (không có hạn đóng)
- Vị trí: src/auth/auth.module.ts:16, src/auth/auth.service.ts:44
- Hợp đồng nói gì: docs/06 không đặt tên biến môi trường.
- Quyết định: `JWT_ACCESS_SECRET` (bắt buộc, getOrThrow → fail-fast), `JWT_ACCESS_TTL=15m`, `REFRESH_TTL_DAYS=7`. Refresh token là opaque random → KHÔNG có secret riêng.
- Lý do: 15m khớp ghi chú §6.4 (token cũ ≤15m); 7d khớp Max-Age §6.4. .env trong .gitignore (không commit secret). Duyệt ở plan Bước 2.

---

### `GET /auth/me` khi token hợp lệ nhưng user biến mất (Bước 2)
- Trạng thái: mở (edge phòng thủ; không có hạn đóng)
- Vị trí: src/auth/auth.service.ts:131
- Hợp đồng nói gì: §6.2 chỉ mô tả 200 {user}; im lặng ca user không còn.
- Quyết định: trả 401 TOKEN_INVALID.
- Lý do: refresh token cascade theo user nên ca này gần như bất khả (token sống ⇒ user còn); nếu xảy ra, coi access token đã vô nghĩa. Dùng code có sẵn trong registry, không bịa code mới.

---

## Cách thêm entry mới

Mỗi khi `/check-spine` hoặc plan-mode review gặp một chỗ spine để ngỏ và bạn duyệt một giá trị cụ thể, thêm entry vào đây **trước khi commit** — đừng để trôi vào chỉ commit message. Nếu entry đó có ngày hết hạn tự nhiên (một module sau sẽ phải xử lý), ghi rõ "đóng ở Bước N" và **đặt một dòng nhắc trong `CLAUDE.md`** ở bước đó nếu rủi ro bị quên là cao.
