import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("uses native Next.js with lazy Neon persistence", async () => {
  const [packageJson, database, schema, environment, vercel, roleMigration] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0002_global_role_library.sql", import.meta.url), "utf8"),
  ]);

  assert.match(packageJson, /"build": "next build"/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|@cloudflare\/vite-plugin/);
  assert.match(database, /drizzle-orm\/neon-http/);
  assert.match(database, /process\.env\.DATABASE_URL/);
  assert.doesNotMatch(database, /cloudflare:workers|drizzle-orm\/d1/);
  assert.match(schema, /drizzle-orm\/pg-core/);
  assert.match(roleMigration, /normalized_name/);
  assert.match(roleMigration, /prevent_duplicate_active_role_template/);
  assert.match(roleMigration, /revision/);
  assert.match(environment, /^DATABASE_URL=/m);
  assert.match(vercel, /"framework": "nextjs"/);

  await assert.rejects(access(new URL("../.openai/hosting.json", import.meta.url)));
  await assert.rejects(access(new URL("../worker/index.ts", import.meta.url)));
  await assert.rejects(access(new URL("../vite.config.ts", import.meta.url)));
});
