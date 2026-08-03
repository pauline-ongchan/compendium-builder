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

test("reconstructs bold Google Docs cells exported one per line", () => {
  const blocks = parseScheduleTable(`**Thursday (Jan. 28, 2027) - Main Goal, Inspiration for 2nd and 3rd Day**
**Time**
**Event**
**5:30 PM**
**Registration**
**6:00 PM**
**Opening Ceremonies**
**6:30 PM**
**Keynote**
**7:00 PM**
**Panel**
**7:45 PM**
**Open Networking, Light Refreshments**
**9:00 PM**
**Event Ends**`);

  assert.deepEqual(blocks, [
    { start: "5:30 PM", end: "6:00 PM", label: "Registration", location: "" },
    { start: "6:00 PM", end: "6:30 PM", label: "Opening Ceremonies", location: "" },
    { start: "6:30 PM", end: "7:00 PM", label: "Keynote", location: "" },
    { start: "7:00 PM", end: "7:45 PM", label: "Panel", location: "" },
    { start: "7:45 PM", end: "9:00 PM", label: "Open Networking, Light Refreshments", location: "" },
  ]);
});
