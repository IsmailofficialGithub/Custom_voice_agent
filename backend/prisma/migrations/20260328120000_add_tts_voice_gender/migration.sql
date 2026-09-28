-- AlterTable
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "tts_voice" TEXT NOT NULL DEFAULT 'alloy';
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "tts_gender" TEXT NOT NULL DEFAULT 'neutral';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "tts_voice" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "tts_gender" TEXT;
