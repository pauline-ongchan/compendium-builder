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

test("checks the assigned interval against 30-minute availability slots", () => {
  const days = [{
    id: "day-1",
    label: "Day 1",
    blocks: [{ id: "opening", label: "Opening", start: "9:00", end: "10:30" }],
    assignments: [
      { personId: "jordan", blockId: "opening", role: "Usher", start: "09:30", end: "10:30" },
      { personId: "taylor", blockId: "opening", role: "MC", start: "09:00", end: "10:30" },
    ],
  }];
  const people = [
    { id: "jordan", name: "Jordan", availability: { "day-1": { opening: "conditional" } }, availabilitySlots: { "day-1": { "09:00": false, "09:30": true, "10:00": true } } },
    { id: "taylor", name: "Taylor", availability: { "day-1": { opening: "conditional" } }, availabilitySlots: { "day-1": { "09:00": false, "09:30": true, "10:00": true } } },
  ];

  const intervalChecks = getAssignmentAvailabilityChecks(days, people);
  assert.equal(intervalChecks.length, 1);
  assert.equal(intervalChecks[0].person, "Taylor");
  assert.equal(intervalChecks[0].level, "Partially unavailable");
  assert.equal(intervalChecks[0].schedule, "Day 1 · 9:00a–10:30a · Opening");
});

test("surfaces fully available people who are not assigned or occupied", () => {
  const days = [{
    id: "day-1",
    label: "Day 1",
    blocks: [
      { id: "opening", label: "Opening", start: "9:00", end: "10:00", roles: [{ id: "usher" }] },
      { id: "parallel", label: "Parallel session", start: "9:00", end: "10:00", roles: [{ id: "host" }] },
      { id: "info", label: "Informational block", start: "10:00", end: "10:30", roles: [] },
    ],
    assignments: [{ personId: "busy", blockId: "parallel", role: "Host" }],
  }];
  const people = [
    { id: "alex", name: "Alex", availability: { "day-1": { opening: "available", parallel: "unavailable", info: "available" } } },
    { id: "busy", name: "Busy Person", availability: { "day-1": { opening: "available", parallel: "available", info: "available" } } },
    { id: "partial", name: "Partial Person", availability: { "day-1": { opening: "conditional", parallel: "unavailable", info: "unavailable" } } },
  ];

  const opportunities = getAssignmentAvailabilityChecks(days, people).filter((check) => check.kind === "opportunity");
  assert.deepEqual(opportunities, [{
    kind: "opportunity",
    level: "Available",
    title: "Alex is available and unassigned",
    detail: "Day 1 · Opening · No role assigned",
    person: "Alex",
    schedule: "Day 1 · 9:00–10:00 · Opening",
    role: "Not assigned",
    dayId: "day-1",
    blockId: "opening",
    personId: "alex",
  }]);
});
