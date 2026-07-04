#!/bin/sh
# ITMS backend container entrypoint — GĐ10 Slice 1 (docs/10-deploy-plan.md §5).
# Order is fixed: apply migrations, seed only if the DB is empty, then start the API.
# Discipline: `migrate deploy` ONLY — never `migrate reset`, never `db push`.
set -e

echo "[entrypoint] prisma migrate deploy"
node_modules/.bin/prisma migrate deploy

echo "[entrypoint] seed-if-empty"
node_modules/.bin/tsx scripts/seed-if-empty.ts

echo "[entrypoint] node dist/main"
exec node dist/main
