import assert from "node:assert/strict";
import test from "node:test";
import {
  blockAvailabilityFromSlots,
  getAvailabilitySlots,
  mapTimeAvailabilityToBlocks,
} from "../app/availability.ts";

const day = {
  id: "day-1",
  blocks: [
    { id: "setup", start: "7:30", end: "9:15" },
    { id: "doors", start: "9:15", end: "10:00" },
  ],
};

test("builds stable 30-minute availability slots from event times", () => {
  assert.deepEqual(getAvailabilitySlots(day).map((slot) => slot.key), ["07:30", "08:00", "08:30", "09:00", "09:30"]);
});

test("maps full, partial, and missing free-time coverage to schedule blocks", () => {
  assert.equal(blockAvailabilityFromSlots(day.blocks[0], day, { "07:30": true, "08:00": true, "08:30": true, "09:00": true }), "available");
  assert.equal(blockAvailabilityFromSlots(day.blocks[0], day, { "07:30": true, "08:00": true }), "conditional");
  assert.equal(blockAvailabilityFromSlots(day.blocks[0], day, {}), "unavailable");
});

test("recomputes block availability when schedule block boundaries change", () => {
  const state = {
    days: [structuredClone(day)],
    people: [{
      availability: { "day-1": {} },
      availabilitySlots: { "day-1": { "07:30": true, "08:00": true, "08:30": true, "09:00": false, "09:30": false } },
    }],
  };
  mapTimeAvailabilityToBlocks(state);
  assert.equal(state.people[0].availability["day-1"].setup, "conditional");

  state.days[0].blocks[0].end = "9:00";
  mapTimeAvailabilityToBlocks(state);
  assert.equal(state.people[0].availability["day-1"].setup, "available");
});
