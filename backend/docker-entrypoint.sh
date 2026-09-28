#!/bin/sh
set -e

echo "=== VOICE AGENT BACKEND INITIALIZATION ==="

# 1. Run Prisma DB Migration & Push Schema
echo "🚀 Running Prisma DB Push & Schema Migration..."
npx prisma db push --skip-generate --accept-data-loss

# 2. Enable pgvector Extension & Initialize Vector Columns
echo "⚡ Enabling pgvector extension & vector columns in PostgreSQL..."
node prisma/init-vector.js

echo "🎉 Database migrations and vector setup completed!"
echo "🚀 Starting NestJS Voice Agent Backend Server..."

exec node dist/main.js
