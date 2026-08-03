import assert from "node:assert/strict";
import test from "node:test";
import { parseScheduleTable } from "../app/schedule-import.ts";

test("imports start-time Google Docs tables and expands parallel events", () => {
  const blocks = parseScheduleTable(`Time\tEvent\t
9:30 AM\tRegistration\t
10:00 AM\tOpening Ceremony\t
10:15 AM\tPanel / Fireside:\t
10:30 AM\tFireside Chat A\tCoffee Chats B
11:00 AM\tMasterclass A\tMasterclass B
11:30 AM\tFireside Chat B\tCoffee Chats A`);

  assert.equal(blocks.length, 9);
  assert.deepEqual(blocks[0], { start: "9:30 AM", end: "10:00 AM", label: "Registration", location: "" });
  assert.deepEqual(blocks.filter((block) => block.start === "10:30 AM"), [
    { start: "10:30 AM", end: "11:00 AM", label: "Fireside Chat A", location: "" },
    { start: "10:30 AM", end: "11:00 AM", label: "Coffee Chats B", location: "" },
  ]);
  assert.equal(blocks.at(-1).end, "12:00 PM");
});

test("keeps explicit ranges and optional locations", () => {
  assert.deepEqual(parseScheduleTable("9:00–10:00 | Registration | HA 098"), [
    { start: "9:00", end: "10:00", label: "Registration", location: "HA 098" },
  ]);
});

test("uses an End row as the prior block boundary without creating an End block", () => {
  assert.deepEqual(parseScheduleTable("4:00 PM\tClosing Ceremony\n4:30 PM\tEnd"), [
    { start: "4:00 PM", end: "4:30 PM", label: "Closing Ceremony", location: "" },
  ]);
});
