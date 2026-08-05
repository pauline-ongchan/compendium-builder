import assert from "node:assert/strict";
import test from "node:test";

import queue from "../.github/scripts/agent-queue.cjs";

test("parses supported agent commands from the first line", () => {
  assert.deepEqual(queue.parseCommand("/agent claim lane-b\nextra context"), {
    operation: "claim",
    args: ["lane-b"],
  });
  assert.deepEqual(queue.parseCommand(" /AGENT needs-input confirm copy "), {
    operation: "needs-input",
    args: ["confirm", "copy"],
  });
});

test("ignores comments that are not supported queue commands", () => {
  assert.equal(queue.parseCommand("please /agent claim"), null);
  assert.equal(queue.parseCommand("/agent merge"), null);
  assert.equal(queue.parseCommand(""), null);
});

test("creates short branch-safe issue slugs", () => {
  assert.equal(queue.slugify("Fix the Review action in scheduling"), "fix-the-review-action-in-scheduling");
  assert.equal(queue.slugify("  Café & room / assignments!  "), "cafe-room-assignments");
  assert.ok(queue.slugify("a".repeat(80)).length <= 48);
});
