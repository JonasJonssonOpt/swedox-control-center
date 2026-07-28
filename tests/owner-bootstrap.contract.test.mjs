import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseOwnerBootstrapInput,
  runLocalOwnerBootstrap,
} from "../scripts/bootstrap-control-center-owner.mjs";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";

function environment(overrides = {}) {
  return {
    CONTROL_CENTER_BOOTSTRAP_TARGET: "local",
    CONTROL_CENTER_OWNER_USER_ID: OWNER_ID,
    ...overrides,
  };
}

test("bootstrap input requires explicit confirmation, local target and valid environment UUID", () => {
  assert.deepEqual(
    parseOwnerBootstrapInput(["--confirm-owner-bootstrap"], environment()),
    { mode: "bootstrap", ownerUserId: OWNER_ID },
  );
  assert.equal(
    parseOwnerBootstrapInput(
      ["--confirm-owner-bootstrap", "--verify"],
      environment(),
    ).mode,
    "verify",
  );

  for (const [argv, env] of [
    [[], environment()],
    [["--confirm-owner-bootstrap", "--unknown"], environment()],
    [
      ["--confirm-owner-bootstrap"],
      environment({ CONTROL_CENTER_OWNER_USER_ID: "" }),
    ],
    [
      ["--confirm-owner-bootstrap"],
      environment({ CONTROL_CENTER_OWNER_USER_ID: "invalid" }),
    ],
    [
      ["--confirm-owner-bootstrap"],
      environment({ CONTROL_CENTER_OWNER_USER_ID: ` ${OWNER_ID}` }),
    ],
    [
      ["--confirm-owner-bootstrap"],
      environment({ CONTROL_CENTER_BOOTSTRAP_TARGET: "production" }),
    ],
  ]) {
    assert.throws(() => parseOwnerBootstrapInput(argv, env));
  }
});

test("bootstrap sends identity through stdin and accepts first and idempotent success", () => {
  for (const expected of ["bootstrapped", "already_bootstrapped"]) {
    const calls = [];
    const result = runLocalOwnerBootstrap(
      { mode: "bootstrap", ownerUserId: OWNER_ID },
      {
        findDatabaseContainer: () => "verified-local-container",
        execute: (container, sql) => {
          calls.push({ container, sql });
          return expected;
        },
      },
    );
    assert.equal(result, expected);
    assert.equal(calls[0].container, "verified-local-container");
    assert.match(calls[0].sql, /private\.bootstrap_control_center_owner/);
    assert.match(calls[0].sql, new RegExp(OWNER_ID));
  }
});

test("verification is categorical and mismatch never becomes success", () => {
  assert.equal(
    runLocalOwnerBootstrap(
      { mode: "verify", ownerUserId: OWNER_ID },
      {
        findDatabaseContainer: () => "verified-local-container",
        execute: () => "ok",
      },
    ),
    "ok",
  );

  for (const status of [
    "auth_user_not_found",
    "invalid_database_owner_state",
    "missing_database_owner",
    "owner_mismatch",
  ]) {
    assert.throws(
      () =>
        runLocalOwnerBootstrap(
          { mode: "bootstrap", ownerUserId: OWNER_ID },
          {
            findDatabaseContainer: () => "verified-local-container",
            execute: () => status,
          },
        ),
      (error) => {
        assert.equal(error.message.includes(OWNER_ID), false);
        return true;
      },
    );
  }
});

test("bootstrap has no HTTP surface, service-role path, signup change or secret persistence", async () => {
  const [script, migration] = await Promise.all([
    readFile(
      new URL("../scripts/bootstrap-control-center-owner.mjs", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260728170000_create_owner_bootstrap_admin_api.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(
    script,
    /writeFile|appendFile|dotenv|service.role|supabaseKey|fetch\(|https?:/i,
  );
  assert.match(
    migration,
    /create function private\.bootstrap_control_center_owner/,
  );
  assert.match(migration, /lock table public\.control_center_owner/);
  assert.match(migration, /from auth\.users/);
  assert.match(migration, /revoke execute[\s\S]*authenticated/);
  assert.doesNotMatch(
    migration,
    /grant execute|enable_signup|disable.*row level security/i,
  );

  const routeSources = await Promise.all([
    readFile(new URL("../app/api/tenants/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/tenants/actions.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(
    routeSources.join("\n"),
    /bootstrap_control_center_owner/,
  );
});
