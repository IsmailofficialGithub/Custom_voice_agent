-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_secret" TEXT;
