import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  cleanupSql,
  executeFixtureOperation,
  FIXTURE_CODE_PREFIX,
  FIXTURE_COUNT,
  FIXTURE_ENVIRONMENT,
  fixtureRows,
  parseFixtureInput,
  safeSummary,
  seedSql,
} from "../scripts/runtime-tests/installation-pagination-fixtures.mjs";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const PROJECT_REF = "runtimefixtureproject";
const validEnvironment = Object.freeze({
  CONTROL_CENTER_RUNTIME_TEST_CONFIRM: "YES",
  CONTROL_CENTER_RUNTIME_TEST_PROJECT_REF: PROJECT_REF,
  CONTROL_CENTER_RUNTIME_TEST_TARGET: "cloud-test",
  CONTROL_CENTER_RUNTIME_TEST_TENANT_ID: TENANT_ID,
  PGHOST: `db.${PROJECT_REF}.supabase.co`,
});

test("fixture input requires explicit target, confirmation, tenant and matching PG project", () => {
  assert.deepEqual(parseFixtureInput(["--dry-run"], validEnvironment), {
    dryRun: true,
    tenantId: TENANT_ID,
  });
  for (const key of [
    "CONTROL_CENTER_RUNTIME_TEST_CONFIRM",
    "CONTROL_CENTER_RUNTIME_TEST_PROJECT_REF",
    "CONTROL_CENTER_RUNTIME_TEST_TARGET",
    "CONTROL_CENTER_RUNTIME_TEST_TENANT_ID",
    "PGHOST",
  ]) {
    const invalid = { ...validEnvironment };
    delete invalid[key];
    assert.throws(() => parseFixtureInput([], invalid));
  }
  assert.throws(() => parseFixtureInput(["--write"], validEnvironment));
});

test("fixture identity is exactly 55 unique planned test rows with locked names", () => {
  const rows = fixtureRows();
  assert.equal(FIXTURE_COUNT, 55);
  assert.equal(FIXTURE_ENVIRONMENT, "test");
  assert.equal(FIXTURE_CODE_PREFIX, "pagination-fixture-");
  assert.equal(rows.length, 55);
  assert.equal(new Set(rows.map(({ code }) => code)).size, 55);
  assert.deepEqual(rows[0], {
    code: "pagination-fixture-001",
    displayName: "Pagination Fixture 001",
  });
  assert.deepEqual(rows.at(-1), {
    code: "pagination-fixture-055",
    displayName: "Pagination Fixture 055",
  });
});

test("seed is idempotent, nullable and dry-run contains no installation write", () => {
  const dryRun = seedSql({ dryRun: true, tenantId: TENANT_ID });
  const write = seedSql({ dryRun: false, tenantId: TENANT_ID });
  assert.doesNotMatch(dryRun, /insert into public\.installations\s*\(/i);
  assert.match(dryRun, /rollback;/);
  assert.match(write, /where not exists/i);
  assert.match(write, /null, null, null, null, 1/);
  assert.match(write, /owner\.owner_user_id, owner\.owner_user_id/);
  assert.doesNotMatch(write, /owner\.user_id/);
  assert.match(write, /category = 'internal'/);
  assert.match(write, /operational_status = 'active'/);
  assert.match(write, /fixture_collision_or_drift/);
  assert.doesNotMatch(write, /create_installation|service_role|http|fetch/i);
});

test("cleanup is exact, refuses audit or drift and has no broad destructive operation", () => {
  const dryRun = cleanupSql({ dryRun: true, tenantId: TENANT_ID });
  const write = cleanupSql({ dryRun: false, tenantId: TENANT_ID });
  assert.doesNotMatch(dryRun, /delete from public\.installations/i);
  assert.match(dryRun, /rollback;/);
  assert.match(write, /using runtime_installation_pagination_fixtures fixture/);
  assert.match(write, /installation\.tenant_id = '[^']+'::uuid/);
  assert.match(write, /fixture_has_audit_and_must_not_be_deleted/);
  assert.match(write, /fixture_collision_or_drift/);
  assert.doesNotMatch(
    write,
    /truncate|cascade|disable\s+trigger|delete\s+from\s+public\.installation_audit_events|like\s+'pagination/i,
  );
});

test("database failures are masked and summaries expose no tenant or credentials", () => {
  assert.throws(() =>
    executeFixtureOperation(
      "seed",
      { dryRun: true, tenantId: TENANT_ID },
      () => ({
        status: 1,
        stderr: "postgres://secret",
        stdout: "",
      }),
    ),
  );
  const result = executeFixtureOperation(
    "seed",
    { dryRun: true, tenantId: TENANT_ID },
    () => ({ status: 0, stdout: "12|43|55\n" }),
  );
  const output = safeSummary(
    "seed",
    { dryRun: true, tenantId: TENANT_ID },
    result,
  );
  assert.match(output, /Existing fixtures: 12/);
  assert.match(output, /Would create: 43/);
  assert.doesNotMatch(output, new RegExp(TENANT_ID));
  assert.doesNotMatch(output, /password|postgres:\/\//i);
});

test("fixture tools remain terminal-only and outside every app import", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url)),
  );
  assert.equal(
    packageJson.scripts["runtime:test:installations:seed-pagination"],
    "node scripts/runtime-tests/create-installation-pagination-fixtures.mjs",
  );
  assert.equal(
    packageJson.scripts["runtime:test:installations:cleanup-pagination"],
    "node scripts/runtime-tests/cleanup-installation-pagination-fixtures.mjs",
  );
  async function sources(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => {
        const path = new URL(
          `${entry.name}${entry.isDirectory() ? "/" : ""}`,
          directory,
        );
        return entry.isDirectory()
          ? sources(path)
          : /\.(?:ts|tsx|js|jsx|mjs)$/u.test(entry.name)
            ? readFile(path, "utf8").then((source) => [source])
            : [];
      }),
    );
    return nested.flat();
  }
  const appSources = await sources(new URL("../app/", import.meta.url));
  assert.doesNotMatch(
    appSources.join("\n"),
    /runtime-tests|pagination-fixture/,
  );
  const toolSource = await readFile(
    new URL(
      "../scripts/runtime-tests/installation-pagination-fixtures.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(toolSource, /@supabase|service[_ -]?role|https?:\/\//i);
  assert.match(toolSource, /spawnSync\(\s*"psql"/);
  assert.doesNotMatch(toolSource, /PGPASSWORD|DATABASE_URL|connectionString/);
});
