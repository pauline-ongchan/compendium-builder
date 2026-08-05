import assert from "node:assert/strict";
import test from "node:test";
import { blocksOverlap, findAssignmentConflict } from "../app/availability.ts";

const exact = { id: "exact", label: "Opening", start: "9:00", end: "10:00" };
const partial = { id: "partial", label: "Registration", start: "9:30", end: "10:30" };
const adjacent = { id: "adjacent", label: "Lunch", start: "10:00", end: "11:00" };

test("detects exact and partial overlaps without blocking adjacent blocks", () => {
  assert.equal(blocksOverlap(exact, { ...exact, id: "same-time" }), true);
  assert.equal(blocksOverlap(exact, partial), true);
  assert.equal(blocksOverlap(exact, adjacent), false);
});

test("finds the assignment that reserves an overlapping time range", () => {
  const day = {
    blocks: [exact, partial, adjacent],
    assignments: [{ id: "assignment-1", personId: "person-1", blockId: exact.id }],
  };

  assert.equal(findAssignmentConflict(day, "person-1", partial.id)?.block.label, "Opening");
  assert.equal(findAssignmentConflict(day, "person-1", adjacent.id), undefined);
  assert.equal(findAssignmentConflict(day, "person-2", partial.id), undefined);
});

test("ignores the assignment being edited and restores availability after removal or change", () => {
  const day = {
    blocks: [exact, partial],
    assignments: [{ id: "assignment-1", personId: "person-1", blockId: exact.id }],
  };

  assert.equal(findAssignmentConflict(day, "person-1", exact.id, "assignment-1"), undefined);
  assert.ok(findAssignmentConflict(day, "person-1", partial.id));

  day.assignments[0].personId = "person-2";
  assert.equal(findAssignmentConflict(day, "person-1", partial.id), undefined);

  day.assignments.length = 0;
  assert.equal(findAssignmentConflict(day, "person-2", partial.id), undefined);
});
