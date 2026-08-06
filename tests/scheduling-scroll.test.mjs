import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps assignment context visible in a bounded scheduling scroller", async () => {
  const [styles, workspace] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/relay-workspace.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(styles, /\.timeline-scroll \{[^}]*max-height: min\(68dvh, 720px\);[^}]*overflow: auto;/);
  assert.match(styles, /\.timeframe-head \{[^}]*position: sticky;[^}]*top: 0;/);
  assert.match(styles, /\.block-head-wrap \{ top: 40px; \}/);
  assert.match(styles, /\.timeline-corner \{[^}]*top: 0;[^}]*left: 0;/);
  assert.match(workspace, /className="timeline-scroll" tabIndex=\{0\} aria-label=\{`\$\{activeDay\.label\} assignment grid`\}/);
});
