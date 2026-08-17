import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("event lifecycle persistence and controls include archive, restore, and permanent delete", async () => {
  const [route, schema, migration, workspace, styles] = await Promise.all([
    readFile(new URL("../app/api/event-state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0004_event_archiving.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/relay-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /if \(record\.archivedAt\) archivedStates\.push\(state\)/);
  assert.match(schema, /archivedAt: timestamp\("archived_at"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "archived_at"/);
  assert.match(workspace, />Archived <span>\{archivedEvents\.length\}<\/span>/);
  assert.match(workspace, />Restore<\/button>/);
  assert.match(workspace, /This permanently removes the event/);
  assert.match(styles, /\.event-library-empty/);
});
