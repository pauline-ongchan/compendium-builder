import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyUpdate, isUpdate, publicState } from "../app/public-event-state.ts";
import { isApprovedAdminEmail } from "../app/admin-access.ts";

function eventPayload() {
  return JSON.stringify({
    eventId: "event-1",
    eventName: "Relay Day",
    contacts: [{ id: "contact", name: "Director", phone: "555-0100" }],
    resources: [{ id: "runbook", label: "Runbook", url: "https://example.com" }],
    prepSessions: [{ id: "prep-1" }],
    days: [{ id: "day-1", blocks: [{ id: "block-1", start: "9:00 AM", end: "10:00 AM", label: "Welcome" }], assignments: [{ id: "assignment-1", personId: "person-1", blockId: "block-1" }] }],
    people: [{
      id: "person-1",
      name: "Alex",
      email: "alex@example.com",
      phone: "555-0199",
      privateNote: "Private",
      preferences: ["Materials"],
      availability: { "day-1": { "block-1": "unavailable" } },
      availabilitySlots: { "day-1": { "09:00": false, "09:30": false } },
      prepAvailability: { "prep-1": "available" },
    }],
  });
}

test("administrator allowlist uses normalized exact email matches", () => {
  const previous = process.env.RELAY_ADMIN_EMAILS;
  process.env.RELAY_ADMIN_EMAILS = " Director@Example.com,helper@example.com ";
  assert.equal(isApprovedAdminEmail("director@example.com"), true);
  assert.equal(isApprovedAdminEmail("other@example.com"), false);
  process.env.RELAY_ADMIN_EMAILS = previous;
});

test("public event payload removes private roster fields", () => {
  const state = publicState(eventPayload());
  assert.equal(state.people[0].email, "");
  assert.equal(state.people[0].phone, "");
  assert.equal(state.people[0].privateNote, "");
  assert.deepEqual(state.people[0].preferences, []);
  assert.equal(state.contacts[0].phone, "555-0100");
});

test("public availability updates cannot alter protected event fields", () => {
  const before = JSON.parse(eventPayload());
  const after = JSON.parse(applyUpdate(eventPayload(), { kind: "availability", personId: "person-1", dayId: "day-1", slotKey: "09:00", value: true }));

  assert.deepEqual(after.days, before.days);
  assert.deepEqual(after.contacts, before.contacts);
  assert.deepEqual(after.resources, before.resources);
  assert.equal(after.people[0].availabilitySlots["day-1"]["09:00"], true);
  assert.equal(after.people[0].availability["day-1"]["block-1"], "conditional");
});

test("public updates accept only scoped availability shapes", () => {
  assert.equal(isUpdate({ kind: "availability", personId: "person-1", dayId: "day-1", slotKey: "09:00", value: true }), true);
  assert.equal(isUpdate({ kind: "prepAvailability", personId: "person-1", sessionId: "prep-1", value: "conditional" }), true);
  assert.equal(isUpdate({ kind: "schedule", personId: "person-1", assignments: [] }), false);
  assert.equal(isUpdate({ kind: "availability", personId: "person-1", dayId: "day-1", slotKey: "bad", value: true }), false);
});

test("public updates reject stale roster, time, and prep identifiers", () => {
  assert.throws(() => applyUpdate(eventPayload(), { kind: "availability", personId: "missing", dayId: "day-1", slotKey: "09:00", value: true }), /roster member/);
  assert.throws(() => applyUpdate(eventPayload(), { kind: "availability", personId: "person-1", dayId: "day-1", slotKey: "23:00", value: true }), /availability time/);
  assert.throws(() => applyUpdate(eventPayload(), { kind: "prepAvailability", personId: "person-1", sessionId: "missing", value: "available" }), /prep session/);
});

test("admin writes are guarded and publishing has a separate snapshot", async () => {
  const [eventRoute, publishRoute, roleRoute, importRoute, schema, migration, environment] = await Promise.all([
    readFile(new URL("../app/api/event-state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/event-state/publish/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/role-library/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google-doc-import/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0002_admin_exec_access.sql", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  for (const route of [eventRoute, publishRoute, roleRoute, importRoute]) assert.match(route, /requireAdminApi/);
  assert.match(schema, /publishedPayload: text\("published_payload"\)/);
  assert.match(schema, /shareToken: text\("share_token"\)\.unique\(\)/);
  assert.match(publishRoute, /publishedPayload: payload/);
  assert.match(migration, /UPDATE "event_states"[\s\S]*"published_payload" = "payload"/);
  assert.match(environment, /^GOOGLE_CLIENT_ID=/m);
  assert.match(environment, /^RELAY_ADMIN_EMAILS=/m);
});
