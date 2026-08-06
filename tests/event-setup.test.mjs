import assert from "node:assert/strict";
import test from "node:test";
import { validateDayCount } from "../app/event-setup.ts";

test("accepts valid event day counts without normalizing them", () => {
  assert.deepEqual(validateDayCount("1"), { value: 1, error: "" });
  assert.deepEqual(validateDayCount("4"), { value: 4, error: "" });
  assert.deepEqual(validateDayCount("7"), { value: 7, error: "" });
});

test("keeps incomplete and invalid day counts visible with clear validation", () => {
  assert.deepEqual(validateDayCount(""), { value: null, error: "Enter the number of days." });
  assert.deepEqual(validateDayCount("2.5"), { value: null, error: "Use a whole number of days." });
  assert.deepEqual(validateDayCount("0"), { value: null, error: "Enter a number from 1 to 7." });
  assert.deepEqual(validateDayCount("8"), { value: null, error: "Enter a number from 1 to 7." });
});
