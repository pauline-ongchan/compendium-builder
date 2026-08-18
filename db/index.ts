import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is unavailable. Connect a Neon Postgres database to this Vercel project.",
    );
  }

  return drizzle({ client: neon(databaseUrl), schema });
}

let database: ReturnType<typeof createDb> | null = null;
let databaseSetup: Promise<void> | null = null;

export function getDb() {
  database ??= createDb();
  return database;
}

async function initializeDb() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS event_states (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS role_templates (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#d8d2ef',
      revision INTEGER NOT NULL DEFAULT 1,
      merged_into_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    )
  `);
  await db.execute(sql`ALTER TABLE role_templates ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#d8d2ef'`);
  await db.execute(sql`ALTER TABLE role_templates ADD COLUMN IF NOT EXISTS normalized_name TEXT NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE role_templates ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1`);
  await db.execute(sql`ALTER TABLE role_templates ADD COLUMN IF NOT EXISTS merged_into_id TEXT`);
  await db.execute(sql`
    UPDATE role_templates
    SET normalized_name = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g'))
    WHERE normalized_name = ''
  `);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION prevent_duplicate_active_role_template()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.merged_into_id IS NULL AND EXISTS (
        SELECT 1 FROM role_templates existing
        WHERE existing.id <> NEW.id
          AND existing.merged_into_id IS NULL
          AND existing.normalized_name = NEW.normalized_name
      ) THEN
        RAISE EXCEPTION 'An equivalent active role template already exists.' USING ERRCODE = '23505';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'role_templates_prevent_duplicate_active') THEN
        CREATE TRIGGER role_templates_prevent_duplicate_active
        BEFORE INSERT OR UPDATE OF normalized_name, merged_into_id ON role_templates
        FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_active_role_template();
      END IF;
    END $$
  `);
  await db.execute(sql`ALTER TABLE event_states ADD COLUMN IF NOT EXISTS published_payload TEXT`);
  await db.execute(sql`ALTER TABLE event_states ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE event_states ADD COLUMN IF NOT EXISTS published_by TEXT`);
  await db.execute(sql`ALTER TABLE event_states ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE event_states ADD COLUMN IF NOT EXISTS archived_by TEXT`);
  await db.execute(sql`
    UPDATE event_states
    SET published_payload = payload,
        published_at = updated_at,
        published_by = updated_by
    WHERE published_payload IS NULL
      AND LOWER(COALESCE(payload::jsonb ->> 'publishedAt', '')) NOT IN ('', 'not published')
  `);
}

export function ensureDb() {
  if (!databaseSetup) {
    databaseSetup = initializeDb().catch((error) => {
      databaseSetup = null;
      throw error;
    });
  }
  return databaseSetup;
}
