import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function sourceFiles(directory) {
  const entries = await readdir(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}

test("user-facing feedback stays inside the app", async () => {
  const appFiles = await sourceFiles("app");
  for (const file of appFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:window\.)?(?:alert|confirm|prompt)\s*\(/, `${file} uses a browser-native dialog`);
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error)\s*\(/, `${file} writes feedback to the console`);
  }
});

test("the workspace renders in-app feedback surfaces", async () => {
  const source = await readFile(new URL("../app/relay-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /className={`toast/);
  assert.match(source, /ConfirmationDialog/);
});
