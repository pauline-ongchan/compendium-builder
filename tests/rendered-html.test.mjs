import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships Relay product metadata and removes the starter preview", async () => {
  const [page, layout, workspace] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/relay-workspace.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /RelayWorkspace/);
  assert.match(page, /Event operations, in sync/);
  assert.match(layout, /Relay — Event operations, in sync/);
  assert.match(workspace, /Import from Google Docs/);
  assert.match(workspace, /Exec roster and teams/);
  assert.match(workspace, /Share availability/);
  assert.match(workspace, /When are you free/);
  assert.match(workspace, /mapped automatically to the current schedule blocks/);
  assert.match(workspace, /Preferences and private notes/);
  assert.match(workspace, /Role library/);
  assert.match(workspace, /Add from library/);
  assert.match(workspace, /Event modules/);
  assert.match(workspace, /Judging rooms/);
  assert.match(workspace, /Prep mini-compendium/);
  assert.match(workspace, /Prep availability/);
  assert.match(workspace, /Event home base/);
  assert.match(workspace, /Participant Registration/);
  assert.match(workspace, /Day-of essentials/);
  assert.match(workspace, /Duplicate/);
  assert.match(workspace, /onClick=\{onViewAll\}>View all checks/);
  assert.match(workspace, /Scheduling checks/);
  assert.doesNotMatch(workspace, /Build the flow, keep the judgment/);
  assert.match(workspace, /Preview as exec/);
  assert.doesNotMatch(`${page}${layout}${workspace}`, /codex-preview|SkeletonPreview/);
});
