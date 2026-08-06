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

export function getDb() {
  database ??= createDb();
  return database;
}

export async function ensureDb() {
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
      description TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    )
  `);
}
