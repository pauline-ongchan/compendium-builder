import assert from "node:assert/strict";
import test from "node:test";
import { getPublicationStatus } from "../app/publication-status.ts";

test("keeps unpublished status separate from publication activity", () => {
  assert.deepEqual(getPublicationStatus("Not published"), {
    isPublished: false,
    status: "Not published",
    activity: "No publication yet",
    scheduleLabel: "Draft schedule",
  });
  assert.equal(getPublicationStatus("").status, "Not published");
});

test("describes a published event with a distinct timestamp", () => {
  assert.deepEqual(getPublicationStatus("Just now"), {
    isPublished: true,
    status: "Published",
    activity: "Last published Just now",
    scheduleLabel: "Published schedule",
  });
});
