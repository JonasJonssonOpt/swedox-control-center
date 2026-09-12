import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format, resolveConfig } from "prettier";
import { applyDatabaseTypeOverrides } from "./database-type-overrides.mjs";

const target = resolve("lib/supabase/database.types.ts");
const result = spawnSync(
  process.execPath,
  [
    resolve("node_modules/supabase/dist/supabase.js"),
    "gen",
    "types",
    "typescript",
    "--local",
    "--schema",
    "public",
  ],
  { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, windowsHide: true },
);

if (result.error || result.status !== 0) {
  throw new Error(
    "Local database type generation failed; existing file preserved.",
  );
}
const output = await format(applyDatabaseTypeOverrides(result.stdout), {
  ...(await resolveConfig(target)),
  parser: "typescript",
});
await writeFile(target, output, "utf8");
console.log(
  "Local database types generated with explicit RPC nullability overrides.",
);
