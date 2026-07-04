# ITMS backend image — GĐ10 Slice 1 (docs/10-deploy-plan.md §4).
# Multi-stage node:22-alpine. Builder compiles argon2 for musl and generates the Prisma
# client on the SAME base as runtime so the query engine matches (musl). Runtime is NOT
# prod-only: it carries the whole node_modules (Prisma CLI + tsx + argon2 + generated client)
# so the entrypoint can run `migrate deploy` + seed before starting the API.

# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app

# Native build deps for argon2 on Alpine/musl (no prebuilt binary there).
RUN apk add --no-cache python3 make g++

# Install with the lockfile first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client on this base (engine = linux-musl-openssl-3.0.x).
COPY prisma ./prisma
RUN npx prisma generate

# Compile TypeScript → dist (entry dist/main.js).
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

# openssl for the Prisma query engine at runtime.
RUN apk add --no-cache openssl

# Carry the built artifacts + full node_modules (Prisma CLI, tsx, argon2, @prisma/client)
# + prisma/ (schema, migrations, seed) so the entrypoint is self-sufficient.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY scripts ./scripts
RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 3000

# migrate deploy → seed-if-empty → node dist/main (docs/10 §5).
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
