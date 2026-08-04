import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("omits the redundant nodejs compatibility flag from deployment output", async () => {
  const config = JSON.parse(
    await readFile(
      new URL("../dist/server/wrangler.json", import.meta.url),
      "utf8",
    ),
  );

  assert.ok(!config.compatibility_flags?.includes("nodejs_compat"));
});
