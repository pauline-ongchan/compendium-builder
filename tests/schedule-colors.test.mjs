import assert from "node:assert/strict";
import test from "node:test";

import { colorBlocksByTime } from "../app/schedule-colors.ts";

test("gives concurrent blocks one color and every different time group a distinct color", () => {
  const blocks = colorBlocksByTime([
    { id: "a", start: "09:00", color: "#000000" },
    { id: "b", start: "09:00", color: "#ffffff" },
    { id: "c", start: "09:30", color: "#000000" },
    { id: "d", start: "10:00", color: "#000000" },
  ], (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3)));

  assert.equal(blocks[0].color, blocks[1].color);
  assert.notEqual(blocks[1].color, blocks[2].color);
  assert.notEqual(blocks[2].color, blocks[3].color);
  assert.equal(new Set(blocks.map((block) => block.color)).size, 3);
});

test("does not repeat colors when a day has many time groups", () => {
  const blocks = colorBlocksByTime(Array.from({ length: 24 }, (_, index) => ({ start: String(index), color: "#000000" })), Number);
  assert.equal(new Set(blocks.map((block) => block.color)).size, blocks.length);
});
