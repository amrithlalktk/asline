#!/bin/sh
set -e

npx prisma migrate deploy

CATEGORY_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.category.count().then((n) => { console.log(n); process.exit(0); }).catch(() => { console.log(0); process.exit(0); });
")

if [ "$CATEGORY_COUNT" = "0" ]; then
  echo "No categories found — seeding defaults."
  node prisma/seed.cjs
fi

exec "$@"
