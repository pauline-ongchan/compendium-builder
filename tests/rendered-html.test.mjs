import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships Relay product metadata and schedule-first role assignment", async () => {
  const [page, layout, workspace, styles, roleApi, schema] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/relay-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/role-library/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
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
  assert.doesNotMatch(workspace, /Published \{data\.publishedAt\}/);
  assert.doesNotMatch(workspace, /Last publish \{data\.publishedAt\}/);
  assert.match(workspace, /onInput=\{\(event\) => setDayCountInput\(event\.currentTarget\.value\)\}/);
  assert.match(workspace, /onBlur=\{\(event\) => setDayCountInput\(event\.currentTarget\.value\)\}/);
  assert.match(workspace, /aria-describedby=\{dayCount\.error/);
  assert.doesNotMatch(workspace, /setDayCount\(Math\.max/);
  assert.doesNotMatch(workspace, /Build the flow, keep the judgment/);
  assert.match(workspace, /Preview as exec/);
  assert.match(workspace, /Unlocked/);
  assert.match(workspace, /Edit role/);
  assert.match(workspace, /Assign available rest/);
  assert.match(workspace, /Search role library/);
  assert.match(workspace, /blockRoleId/);
  assert.match(styles, /\.timeline-scroll\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/);
  assert.match(styles, /\.timeline-corner\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0/);
  assert.match(styles, /\.block-head\.assignment-ready\s*\{[^}]*position:\s*sticky;[^}]*top:\s*40px/);
  assert.doesNotMatch(workspace, /Intensity|People needed|Role coverage/);
  assert.match(roleApi, /roleTemplates/);
  assert.match(schema, /role_templates/);
  assert.doesNotMatch(`${page}${layout}${workspace}`, /codex-preview|SkeletonPreview/);
});
