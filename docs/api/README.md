# api/

Bản export tĩnh của tài liệu API — để người đọc repo xem được hợp đồng mà không cần dựng stack.
Nguồn sự thật vẫn là `docs/06-api-contract.md` và Swagger sống ở `/api/v1/docs`.

Cách tạo lại:
1. `docker compose up -d --build` (từ gốc repo).
2. Tải OpenAPI JSON: `curl http://localhost:8080/api/v1/docs-json -o docs/api/openapi.json`
   (NestJS tự phục vụ JSON tại đường dẫn `<swagger-path>-json`).
3. Render bản HTML tĩnh: `npx @redocly/cli build-docs docs/api/openapi.json -o docs/api/api-doc.html`

Kiểm: `api-doc.html` phải có đủ 26 endpoint theo 6 nhóm (auth 4, health 1, users 6, teams 7, tasks 7, stats 1).
