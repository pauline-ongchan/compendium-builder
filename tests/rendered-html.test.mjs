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
  assert.match(workspace, /Build the flow, keep the judgment/);
  assert.match(workspace, /Preview as exec/);
  assert.doesNotMatch(`${page}${layout}${workspace}`, /codex-preview|SkeletonPreview/);
});
