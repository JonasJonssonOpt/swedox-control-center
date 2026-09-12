import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyDatabaseTypeOverrides } from "../scripts/database-type-overrides.mjs";

const baseline = readFileSync(
  new URL("../lib/supabase/database.types.ts", import.meta.url),
  "utf8",
);
const start = baseline.indexOf("      list_installations: {");
const end = baseline.indexOf("      list_tenant_audit_events:", start);
const original = baseline.slice(start, end);
const raw =
  baseline.slice(0, start) +
  original.replaceAll("string | null", "string") +
  baseline.slice(end);

test("restores only the existing five RPC nullable fields", () => {
  assert.equal(applyDatabaseTypeOverrides(raw), baseline);
  assert.equal(applyDatabaseTypeOverrides(baseline), baseline);
});

test("preserves unrelated drift for the CI comparison", () => {
  const drift = raw.replace("actor_user_id: string", "actor_user_id: number");
  assert.equal(
    applyDatabaseTypeOverrides(drift),
    baseline.replace("actor_user_id: string", "actor_user_id: number"),
  );
});

test("rejects removed, renamed, optional or changed RPC fields", () => {
  for (const replacement of [
    "",
    "renamed: string;",
    "application_host?: string;",
    "application_host: number;",
  ]) {
    const changed = original.replace(
      "application_host: string | null;",
      replacement,
    );
    assert.throws(() =>
      applyDatabaseTypeOverrides(
        baseline.slice(0, start) + changed + baseline.slice(end),
      ),
    );
  }
});

test("rejects missing schema and malformed generated output", () => {
  assert.throws(() => applyDatabaseTypeOverrides(""));
  assert.throws(() => applyDatabaseTypeOverrides("export type Database = {"));
  assert.throws(() =>
    applyDatabaseTypeOverrides(
      raw.replace("list_installations:", "renamed_rpc:"),
    ),
  );
});
