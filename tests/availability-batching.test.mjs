import assert from "node:assert/strict";
import test from "node:test";

import { AVAILABILITY_IDLE_SAVE_MS, AVAILABILITY_MAX_SAVE_MS, AVAILABILITY_REFRESH_MS, mergeAvailabilityBatch } from "../app/availability-batching.ts";

test("coalesces repeated clicks on one availability cell without losing other people's edits", () => {
  const batch = mergeAvailabilityBatch([
    { personId: "angela", dayId: "day-1", slotKey: "09:00", available: true },
    { personId: "benny", dayId: "day-1", slotKey: "09:00", available: true },
    { personId: "angela", dayId: "day-1", slotKey: "09:00", available: false },
  ]);

  assert.deepEqual(batch, [
    { personId: "angela", dayId: "day-1", slotKey: "09:00", available: false },
    { personId: "benny", dayId: "day-1", slotKey: "09:00", available: true },
  ]);
});

test("uses a short idle save with a bounded continuous-edit wait", () => {
  assert.equal(AVAILABILITY_IDLE_SAVE_MS, 1000);
  assert.equal(AVAILABILITY_MAX_SAVE_MS, 3000);
  assert.ok(AVAILABILITY_REFRESH_MS <= AVAILABILITY_MAX_SAVE_MS);
});
