import assert from "node:assert/strict";
import test from "node:test";

import {
  checkOwnerIntegrity,
  createOwnerIntegrityLogEntry,
  getOwnerEnvironment,
  isOwnerDatabaseStatus,
  OWNER_DATABASE_STATUSES,
} from "../lib/server/auth/owner-integrity.contract.ts";

const OWNER_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_ID = "00000000-0000-4000-8000-000000000022";

function dependencies(overrides = {}) {
  return {
    environmentValue: OWNER_ID,
    getDatabaseStatus: async () => "ok",
    requireOwner: async () => ({ userId: OWNER_ID }),
    ...overrides,
  };
}

test("environment validation distinguishes missing and invalid values", () => {
  assert.deepEqual(getOwnerEnvironment(undefined), {
    code: "missing_environment_owner",
    ok: false,
  });
  assert.deepEqual(getOwnerEnvironment(""), {
    code: "invalid_environment_owner",
    ok: false,
  });
  assert.deepEqual(getOwnerEnvironment("not-an-identifier"), {
    code: "invalid_environment_owner",
    ok: false,
  });
  assert.deepEqual(getOwnerEnvironment(` ${OWNER_ID}`), {
    code: "invalid_environment_owner",
    ok: false,
  });
  assert.deepEqual(getOwnerEnvironment(OWNER_ID.toUpperCase()), {
    ok: true,
    userId: OWNER_ID,
  });
});

test("database status parser accepts only the exact allowlist", () => {
  for (const status of OWNER_DATABASE_STATUSES) {
    assert.equal(isOwnerDatabaseStatus(status), true);
  }

  for (const value of ["unknown", "", null, undefined, [], {}, 1]) {
    assert.equal(isOwnerDatabaseStatus(value), false);
  }
});

test("full owner, AAL2 guard result, and database ok produce success", async () => {
  assert.deepEqual(await checkOwnerIntegrity(dependencies()), {
    ok: true,
    userId: OWNER_ID,
  });
});

test("environment failures stop before authorization and RPC", async () => {
  let authorizationCalls = 0;
  let rpcCalls = 0;

  const result = await checkOwnerIntegrity(
    dependencies({
      environmentValue: undefined,
      getDatabaseStatus: async () => {
        rpcCalls += 1;
        return "ok";
      },
      requireOwner: async () => {
        authorizationCalls += 1;
        return { userId: OWNER_ID };
      },
    }),
  );

  assert.deepEqual(result, {
    code: "missing_environment_owner",
    ok: false,
  });
  assert.equal(authorizationCalls, 0);
  assert.equal(rpcCalls, 0);
});

test("authorization failure propagates and stops before RPC", async () => {
  let rpcCalls = 0;
  const redirectFailure = new Error("redirect");

  await assert.rejects(
    checkOwnerIntegrity(
      dependencies({
        getDatabaseStatus: async () => {
          rpcCalls += 1;
          return "ok";
        },
        requireOwner: async () => {
          throw redirectFailure;
        },
      }),
    ),
    redirectFailure,
  );
  assert.equal(rpcCalls, 0);
});

test("environment and verified Auth mismatch fails before RPC", async () => {
  let rpcCalls = 0;
  const result = await checkOwnerIntegrity(
    dependencies({
      getDatabaseStatus: async () => {
        rpcCalls += 1;
        return "ok";
      },
      requireOwner: async () => ({ userId: OTHER_ID }),
    }),
  );

  assert.deepEqual(result, { code: "owner_mismatch", ok: false });
  assert.equal(rpcCalls, 0);
});

for (const status of [
  "unauthenticated",
  "missing_database_owner",
  "invalid_database_owner_state",
  "authenticated_user_mismatch",
]) {
  test(`database status ${status} fails closed`, async () => {
    assert.deepEqual(
      await checkOwnerIntegrity(
        dependencies({ getDatabaseStatus: async () => status }),
      ),
      { code: status, ok: false },
    );
  });
}

test("unknown, null, and unexpected RPC shapes fail unavailable", async () => {
  for (const data of ["unknown", null, [], {}, 1]) {
    assert.deepEqual(
      await checkOwnerIntegrity(
        dependencies({ getDatabaseStatus: async () => data }),
      ),
      { code: "integrity_check_unavailable", ok: false },
    );
  }
});

test("raw RPC errors are converted to unavailable without exposure", async () => {
  const rawError = {
    details: OWNER_ID,
    message: "sensitive database detail",
  };

  const result = await checkOwnerIntegrity(
    dependencies({
      getDatabaseStatus: async () => {
        throw rawError;
      },
    }),
  );

  assert.deepEqual(result, {
    code: "integrity_check_unavailable",
    ok: false,
  });
  assert.equal(JSON.stringify(result).includes(OWNER_ID), false);
  assert.equal(JSON.stringify(result).includes(rawError.message), false);
});

test("safe log entries contain only allowlisted metadata", () => {
  const entry = createOwnerIntegrityLogEntry(
    "missing_database_owner",
    "synthetic-correlation-id",
    "2026-01-01T00:00:00.000Z",
  );

  assert.deepEqual(Object.keys(entry).sort(), [
    "code",
    "correlationId",
    "event",
    "timestamp",
  ]);
  assert.equal(JSON.stringify(entry).includes(OWNER_ID), false);
  assert.equal(JSON.stringify(entry).includes("database detail"), false);
});

test("checks do not share a module-level cache", async () => {
  let rpcCalls = 0;
  const sharedDependencies = dependencies({
    getDatabaseStatus: async () => {
      rpcCalls += 1;
      return "ok";
    },
  });

  await checkOwnerIntegrity(sharedDependencies);
  await checkOwnerIntegrity(sharedDependencies);

  assert.equal(rpcCalls, 2);
});
