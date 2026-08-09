import assert from "node:assert/strict";
import test from "node:test";
import { moveRoleOptionIndex, nextRoleColor, roleColor } from "../app/role-presentation.ts";

test("keeps a role color stable across blocks while differentiating roles", () => {
  const setupRoles = ["Materials", "Room Scout", "AV"];
  const setupColors = setupRoles.map(roleColor);

  assert.equal(new Set(setupColors).size, setupRoles.length);
  assert.equal(roleColor("Materials"), roleColor("materials"));
  assert.equal(roleColor("Dev Support"), roleColor("Dev Support"));
});

test("chooses a different default color for each newly created role", () => {
  const colors = [];
  for (let index = 0; index < 20; index += 1) colors.push(nextRoleColor(colors));

  assert.equal(new Set(colors).size, colors.length);
  assert.ok(colors.every((color) => /^#[0-9a-f]{6}$/i.test(color)));
});

test("wraps keyboard navigation through role search options", () => {
  assert.equal(moveRoleOptionIndex(-1, 3, "ArrowDown"), 0);
  assert.equal(moveRoleOptionIndex(2, 3, "ArrowDown"), 0);
  assert.equal(moveRoleOptionIndex(0, 3, "ArrowUp"), 2);
  assert.equal(moveRoleOptionIndex(1, 3, "Home"), 0);
  assert.equal(moveRoleOptionIndex(1, 3, "End"), 2);
  assert.equal(moveRoleOptionIndex(0, 0, "ArrowDown"), -1);
});
