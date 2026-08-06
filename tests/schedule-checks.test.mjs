import assert from "node:assert/strict";
import test from "node:test";
import { getScheduleChecksViewState } from "../app/schedule-checks.ts";

const checks = Array.from({ length: 5 }, (_, index) => ({
  level: "Coverage",
  title: `Check ${index + 1}`,
  detail: `Detail ${index + 1}`,
}));

test("returns every scheduling check for the complete checks view", () => {
  const state = getScheduleChecksViewState(checks, false, "");

  assert.equal(state.phase, "ready");
  assert.equal(state.checks.length, 5);
  assert.deepEqual(state.checks.map((check) => check.title), checks.map((check) => check.title));
});

test("represents loading, error, and empty checks states", () => {
  assert.equal(getScheduleChecksViewState(checks, true, "").phase, "loading");
  assert.equal(getScheduleChecksViewState([], false, "").phase, "empty");
  assert.equal(getScheduleChecksViewState(checks, false, "Unable to load shared event data.").error, "Unable to load shared event data.");
});
