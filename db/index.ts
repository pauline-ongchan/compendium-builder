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
    CREATE TABLE IF NOT EXISTS roster_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#d8d2ef',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS roster_people (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      initials TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#d8d2ef',
      group_id TEXT,
      preferences TEXT NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS event_availability (
      event_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      day_id TEXT NOT NULL,
      slot_key TEXT NOT NULL,
      available BOOLEAN NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT,
      PRIMARY KEY (event_id, person_id, day_id, slot_key)
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS event_availability_event_updated_idx ON event_availability (event_id, updated_at)`);
  await db.execute(sql`
    INSERT INTO roster_groups (id, name, color)
    SELECT DISTINCT ON (item->>'id') item->>'id', item->>'name', COALESCE(NULLIF(item->>'color', ''), '#d8d2ef')
    FROM event_states state
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(state.payload::jsonb->'groups', '[]'::jsonb)) item
    WHERE item->>'id' IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM roster_groups LIMIT 1)
    ORDER BY item->>'id', state.updated_at DESC
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO roster_people (id, name, initials, phone, email, color, group_id, preferences)
    SELECT DISTINCT ON (item->>'id')
      item->>'id', item->>'name', COALESCE(item->>'initials', ''), COALESCE(item->>'phone', ''),
      COALESCE(item->>'email', ''), COALESCE(NULLIF(item->>'color', ''), '#d8d2ef'),
      item->'groupIds'->>0, COALESCE((item->'preferences')::text, '[]')
    FROM event_states state
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(state.payload::jsonb->'people', '[]'::jsonb)) item
    WHERE item->>'id' IS NOT NULL
      AND item->>'name' IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM roster_people LIMIT 1)
    ORDER BY item->>'id', state.updated_at DESC
    ON CONFLICT (id) DO NOTHING
  `);
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
