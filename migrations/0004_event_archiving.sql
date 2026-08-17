ALTER TABLE "event_states" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE "event_states" ADD COLUMN IF NOT EXISTS "archived_by" text;
