import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { isAllowedPortalEmail } from "../app/admin-access.ts";

test("portal access accepts only normalized emails in the configured domain", () => {
  const previous = process.env.RELAY_GOOGLE_DOMAIN;
  process.env.RELAY_GOOGLE_DOMAIN = " BizTech.Example ";
  assert.equal(isAllowedPortalEmail("director@biztech.example"), true);
  assert.equal(isAllowedPortalEmail("director@other.example"), false);
  assert.equal(isAllowedPortalEmail("director@biztech.example.evil.com"), false);
  process.env.RELAY_GOOGLE_DOMAIN = previous;
});

test("portal routes are guarded and Exec View rejects archived events", async () => {
  const [eventRoute, publishRoute, publishedRoute, roleRoute, importRoute, schema, migration, cleanupMigration, environment] = await Promise.all([
    readFile(new URL("../app/api/event-state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/event-state/publish/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/event-state/published/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/role-library/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google-doc-import/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0003_admin_exec_access.sql", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0005_remove_event_share_tokens.sql", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  for (const route of [eventRoute, publishRoute, publishedRoute, roleRoute, importRoute]) assert.match(route, /requirePortalApi/);
  assert.match(schema, /publishedPayload: text\("published_payload"\)/);
  assert.doesNotMatch(schema, /shareToken|share_token/);
  assert.match(publishRoute, /publishedPayload: payload/);
  assert.match(publishRoute, /Restore this event before publishing it/);
  assert.match(publishedRoute, /record\.publishedPayload/);
  assert.match(publishedRoute, /record\.archivedAt/);
  assert.match(publishedRoute, /Archived events are unavailable in Exec View/);
  assert.match(migration, /UPDATE "event_states"[\s\S]*"published_payload" = "payload"/);
  assert.match(cleanupMigration, /DROP COLUMN IF EXISTS "share_token"/);
  assert.match(environment, /^GOOGLE_CLIENT_ID=/m);
  assert.match(environment, /^RELAY_GOOGLE_DOMAIN=ubcbiztech\.com$/m);
  await assert.rejects(access(new URL("../app/api/exec/[shareToken]/route.ts", import.meta.url)));
  await assert.rejects(access(new URL("../app/exec/[shareToken]/page.tsx", import.meta.url)));
});
