DROP INDEX IF EXISTS "event_states_share_token_unique";
ALTER TABLE "event_states" DROP COLUMN IF EXISTS "share_token";
