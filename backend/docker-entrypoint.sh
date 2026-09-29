#!/bin/sh
set -e

echo "=== VOICE AGENT BACKEND INITIALIZATION ==="

echo "Waiting for postgres..."
i=0
until node -e "
const u = new URL(process.env.DATABASE_URL);
const s = require('net').connect({ host: u.hostname, port: Number(u.port || 5432) }, () => { s.end(); process.exit(0); });
s.on('error', () => process.exit(1));
setTimeout(() => process.exit(1), 3000);
"; do
  i=$((i + 1))
  if [ "$i" -ge 40 ]; then
    echo "Postgres not reachable: $DATABASE_URL"
    exit 1
  fi
  sleep 2
done

echo "Running Prisma db push..."
npx prisma db push --skip-generate --accept-data-loss

# 2. Enable pgvector Extension & Initialize Vector Columns
echo "⚡ Enabling pgvector extension & vector columns in PostgreSQL..."
node prisma/init-vector.js

echo "🎉 Database migrations and vector setup completed!"
echo "🚀 Starting NestJS Voice Agent Backend Server..."

exec node dist/main.js
