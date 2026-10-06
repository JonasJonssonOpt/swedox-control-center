import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);
const SOURCE_DIRECTORIES = [
  "app",
  "components",
  "hooks",
  "lib",
  "providers",
  "services",
];

async function sourceFiles(directory) {
  const entries = await readdir(new URL(directory, ROOT), {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx|mjs)$/.test(entry.name))
    .map((entry) => pathToFileURL(join(entry.parentPath, entry.name)));
}

test("no browser Supabase client exists in application code", async () => {
  assert.equal(
    existsSync(new URL("lib/supabase/client.ts", ROOT)),
    false,
    "the unused browser client must not be reintroduced",
  );

  const files = (
    await Promise.all(SOURCE_DIRECTORIES.map((dir) => sourceFiles(dir)))
  ).flat();
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(
      source,
      /createBrowserClient|supabase\/client|SUPABASE_SERVICE_ROLE|service_role_key/i,
      file.pathname,
    );
  }
});

test("the only Supabase clients are the server and proxy SSR clients", async () => {
  const supabaseFiles = (await readdir(new URL("lib/supabase/", ROOT))).sort();
  assert.deepEqual(supabaseFiles, [
    "database.types.ts",
    "env.ts",
    "proxy.ts",
    "server.ts",
  ]);
  const server = await readFile(
    new URL("lib/supabase/server.ts", ROOT),
    "utf8",
  );
  assert.match(server, /^import "server-only";/);
  assert.match(server, /createServerClient/);
});
