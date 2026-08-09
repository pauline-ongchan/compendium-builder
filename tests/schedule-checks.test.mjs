import assert from "node:assert/strict";
import test from "node:test";
import { getAssignmentAvailabilityChecks, getScheduleChecksViewState } from "../app/schedule-checks.ts";

const checks = Array.from({ length: 5 }, (_, index) => ({
  level: "Unavailable",
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

test("flags only assigned people who are unavailable for that block", () => {
  const days = [{
    id: "day-1",
    label: "Day 1",
    blocks: [
      { id: "registration", label: "Registration", start: "8:00", end: "9:00" },
      { id: "opening", label: "Opening", start: "9:00", end: "10:00" },
    ],
    assignments: [
      { personId: "angela", blockId: "registration", role: "Welcome" },
      { personId: "benny", blockId: "registration", role: "Check-in" },
      { personId: "cheryl", blockId: "opening", role: "Usher" },
    ],
  }];
  const people = [
    { id: "angela", name: "Angela", availability: { "day-1": { registration: "unavailable" } } },
    { id: "benny", name: "Benny", availability: { "day-1": { registration: "conditional" } } },
    { id: "cheryl", name: "Cheryl", availability: { "day-1": { opening: "available" } } },
    { id: "dane", name: "Dane", availability: { "day-1": { opening: "unavailable" } } },
  ];

  assert.deepEqual(getAssignmentAvailabilityChecks(days, people), [{
    level: "Unavailable",
    title: "Angela is unavailable",
    detail: "Day 1 · Registration · Welcome",
    person: "Angela",
    schedule: "Day 1 · 8:00–9:00 · Registration",
    role: "Welcome",
    dayId: "day-1",
    blockId: "registration",
    personId: "angela",
  }]);
});
