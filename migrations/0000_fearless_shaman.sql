CREATE TABLE "event_states" (
	"id" text PRIMARY KEY NOT NULL,
	"payload" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
