ALTER TABLE "event_states" ADD COLUMN "published_payload" text;
ALTER TABLE "event_states" ADD COLUMN "share_token" text;
ALTER TABLE "event_states" ADD COLUMN "published_at" timestamp with time zone;
ALTER TABLE "event_states" ADD COLUMN "published_by" text;
CREATE UNIQUE INDEX "event_states_share_token_unique" ON "event_states" USING btree ("share_token");

UPDATE "event_states"
SET "published_payload" = "payload",
    "published_at" = "updated_at",
    "published_by" = "updated_by"
WHERE "published_payload" IS NULL
  AND LOWER(COALESCE("payload"::jsonb ->> 'publishedAt', '')) NOT IN ('', 'not published');
