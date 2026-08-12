import assert from "node:assert/strict";
import test from "node:test";
import { assignmentForMoment, sortAssignmentsByTime } from "../app/exec-view.ts";

const blocks = [
  { id: "lunch", start: "11:30", end: "12:30" },
  { id: "setup", start: "7:30", end: "9:15" },
  { id: "hacking", start: "12:30", end: "4:30" },
];
const assignments = [
  { id: "hacking-role", blockId: "hacking" },
  { id: "setup-role", blockId: "setup" },
  { id: "lunch-role", blockId: "lunch" },
];

test("sorts exec assignments chronologically even when published out of order", () => {
  assert.deepEqual(sortAssignmentsByTime(assignments, blocks).map((assignment) => assignment.id), ["setup-role", "lunch-role", "hacking-role"]);
});

test("selects the current role and then the next upcoming role from local time", () => {
  const current = assignmentForMoment(assignments, blocks, new Date(2026, 7, 12, 12, 0));
  assert.equal(current?.assignment.id, "lunch-role");
  assert.equal(current?.state, "current");

  const upcoming = assignmentForMoment(assignments, blocks, new Date(2026, 7, 12, 10, 0));
  assert.equal(upcoming?.assignment.id, "lunch-role");
  assert.equal(upcoming?.state, "upcoming");

  const afternoon = assignmentForMoment(assignments, blocks, new Date(2026, 7, 12, 14, 0));
  assert.equal(afternoon?.assignment.id, "hacking-role");
  assert.equal(afternoon?.state, "current");
});

test("does not call a completed assignment current after the selected day's work ends", () => {
  assert.equal(assignmentForMoment(assignments, blocks, new Date(2026, 7, 12, 18, 0)), null);
});
