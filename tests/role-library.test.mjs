import assert from "node:assert/strict";
import test from "node:test";

import { isRoleSnapshotCustomized, normalizeRoleName, parseRoleImportCsv, replaceRoleTemplateSource, similarRoleTemplates } from "../app/role-library.ts";

test("normalizes equivalent role names to one canonical identity", () => {
  assert.equal(normalizeRoleName(" On-call "), "oncall");
  assert.equal(normalizeRoleName("ON CALL"), "oncall");
  assert.equal(normalizeRoleName("On–call"), "oncall");
  assert.equal(normalizeRoleName("Rôle Lead"), "rolelead");
});

test("parses the master role CSV template and validates required fields", () => {
  const rows = parseRoleImportCsv(`Role name,Description of responsibilities,Colour
Food Team,"Receive, label, and serve food.",#aabbcc
On-call,,#123456
Media,Capture key moments,blue`);

  assert.deepEqual(rows[0], { row: 2, name: "Food Team", description: "Receive, label, and serve food.", color: "#aabbcc", error: undefined });
  assert.equal(rows[1].error, "Description of responsibilities is required.");
  assert.match(rows[2].error, /six-digit hex/);
});

test("finds exact and close role-name candidates without hiding distinct roles", () => {
  const roles = [
    { id: "on-call", name: "On Call", description: "Stay reachable." },
    { id: "food", name: "Food Team", description: "Serve food." },
    { id: "media", name: "Media", description: "Take photos." },
  ];

  assert.deepEqual(similarRoleTemplates("on-call", roles).map((role) => role.id), ["on-call"]);
  assert.deepEqual(similarRoleTemplates("Food Team Lead", roles).map((role) => role.id), ["food"]);
  assert.deepEqual(similarRoleTemplates("Registration", roles), []);
});

test("relinks template sources without changing event-specific role details", () => {
  const event = { days: [{ blocks: [{ roles: [{ templateId: "duplicate", name: "Event Food", description: "Serve tacos", leadPersonId: "person-1" }] }], assignments: [{ templateId: "unrelated", role: "Event Food" }] }] };
  const replaced = replaceRoleTemplateSource(event, "duplicate", "survivor");

  assert.equal(replaced.changed, true);
  assert.deepEqual(replaced.value.days[0].blocks[0].roles[0], { templateId: "survivor", name: "Event Food", description: "Serve tacos", leadPersonId: "person-1" });
  assert.equal(replaced.value.days[0].assignments[0].templateId, "unrelated");
  assert.equal(event.days[0].blocks[0].roles[0].templateId, "duplicate");
});

test("marks only reusable role fields as customized", () => {
  const template = { id: "food", name: "Food Team", description: "Serve food", color: "#aabbcc" };
  assert.equal(isRoleSnapshotCustomized({ name: "Food Team", description: "Serve food", color: "#aabbcc", leadPersonId: "person-1" }, template), false);
  assert.equal(isRoleSnapshotCustomized({ name: "Food Team", description: "Serve tacos", color: "#aabbcc" }, template), true);
});
