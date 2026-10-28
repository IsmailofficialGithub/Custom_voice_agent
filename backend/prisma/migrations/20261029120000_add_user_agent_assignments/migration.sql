ALTER TABLE "users" ADD COLUMN "assigned_agent_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
