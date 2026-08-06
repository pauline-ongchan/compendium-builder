import assert from "node:assert/strict";
import test from "node:test";
import { getScheduleChecksViewState, scheduleMutationAffectsReviewTarget } from "../app/schedule-checks.ts";

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

test("clears a review only when the saved scheduling change affects its target", () => {
  const conflict = { dayId: "day1", blockId: "close", personId: "angela" };

  assert.equal(scheduleMutationAffectsReviewTarget(conflict, conflict), true);
  assert.equal(scheduleMutationAffectsReviewTarget(conflict, { ...conflict, personId: "marcus" }), false);
  assert.equal(scheduleMutationAffectsReviewTarget(conflict, { ...conflict, blockId: "welcome" }), false);
  assert.equal(scheduleMutationAffectsReviewTarget(conflict, { ...conflict, dayId: "day2" }), false);
  assert.equal(scheduleMutationAffectsReviewTarget(null, conflict), false);
});

test("matches block and person review targets to edits within their scope", () => {
  assert.equal(scheduleMutationAffectsReviewTarget(
    { dayId: "day1", blockId: "close" },
    { dayId: "day1", blockId: "close", personId: "angela" },
  ), true);
  assert.equal(scheduleMutationAffectsReviewTarget(
    { dayId: "day1", personId: "angela" },
    { dayId: "day1", blockId: "close", personId: "angela" },
  ), true);
});
