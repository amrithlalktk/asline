#!/bin/sh
# Vercel build: apply migrations, seed defaults, build Next.js.
# Prisma needs DIRECT_URL (the unpooled connection) for migrations. With the
# Vercel + Neon integration that value is provided as DATABASE_URL_UNPOOLED,
# so fall back to it (then to DATABASE_URL) when DIRECT_URL isn't set.
set -e
export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL_UNPOOLED:-$DATABASE_URL}}"
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set — connect a Postgres database (Vercel → Storage) first." >&2
  exit 1
fi
npx prisma migrate deploy
node prisma/seed.cjs
npx next build
