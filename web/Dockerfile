# ITMS frontend image — GĐ10 Slice 2 (docs/10-deploy-plan.md §6).
# Multi-stage: build the React SPA with Node, then serve the static dist with nginx.
# nginx is the front-door — serves the SPA and reverse-proxies /api to the backend (same-origin).

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

# Install with the lockfile first for layer caching, then build (tsc -b && vite build → dist).
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve ----
FROM nginx:alpine

# Front-door config: static SPA + /api reverse-proxy (no path rewrite) + SPA fallback.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
# nginx:alpine default CMD runs `nginx -g 'daemon off;'`.
