CREATE TABLE IF NOT EXISTS "roster_groups" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT '#d8d2ef' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text
);

CREATE TABLE IF NOT EXISTS "roster_people" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "initials" text DEFAULT '' NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "email" text DEFAULT '' NOT NULL,
  "color" text DEFAULT '#d8d2ef' NOT NULL,
  "group_id" text,
  "preferences" text DEFAULT '[]' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text
);

CREATE TABLE IF NOT EXISTS "event_availability" (
  "event_id" text NOT NULL,
  "person_id" text NOT NULL,
  "day_id" text NOT NULL,
  "slot_key" text NOT NULL,
  "available" boolean NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  CONSTRAINT "event_availability_event_id_person_id_day_id_slot_key_pk" PRIMARY KEY("event_id", "person_id", "day_id", "slot_key")
);

CREATE INDEX IF NOT EXISTS "event_availability_event_updated_idx" ON "event_availability" ("event_id", "updated_at");
