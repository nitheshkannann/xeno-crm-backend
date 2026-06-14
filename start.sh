#!/bin/sh
set -e

SCHEMA=/app/prisma/schema.prisma
SEED=/app/prisma/seed.ts

echo "⏳ Pushing database schema..."
cd /app && npx prisma db push --schema="$SCHEMA" --accept-data-loss

echo "🔍 Checking seed status..."
# Count users using psql (available via postgres connection)
# Fall back to seeding if we can't connect or count is 0
USER_COUNT=$(node --input-type=module << 'EOF'
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const n = await p.user.count().catch(() => 0);
await p.$disconnect();
console.log(n);
EOF
) || USER_COUNT=0

if [ -z "$USER_COUNT" ] || [ "$USER_COUNT" = "0" ]; then
  echo "🌱 Seeding database with 1000 customers and sample data..."
  cd /app && DATABASE_URL="$DATABASE_URL" npx tsx "$SEED"
  echo "✅ Seed complete!"
else
  echo "✅ Database already seeded (${USER_COUNT} users found)"
fi

echo "🚀 Starting XENO CRM Backend..."
exec npx tsx /app/src/index.ts
