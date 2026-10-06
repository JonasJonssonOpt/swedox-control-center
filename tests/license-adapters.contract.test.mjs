import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { redirect } from "next/navigation";

import { createLicenseActionCore } from "../lib/server/licenses/license-action-core.ts";
import { LicenseServiceError } from "../lib/server/licenses/license.errors.ts";
import {
  createGetLicenseRoute,
  createListLicenseAuditEventsRoute,
  createListLicenseTermsVersionsRoute,
  createListLicensesRoute,
} from "../lib/server/licenses/license-read-route.ts";
import { stockholmLocalToUtc } from "../lib/server/licenses/license-time.ts";

const LICENSE_ID = "20000000-0000-4000-8000-000000000001";
const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const CORRELATION_ID = "50000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ licenseId: LICENSE_ID }) };

function quietly(fn) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = original;
    });
}
function form(entries) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

test("Stockholm wall time converts to one exact UTC instant and rejects DST gaps and overlaps", () => {
  assert.equal(
    stockholmLocalToUtc("2027-01-01T00:00"),
    "2026-12-31T23:00:00.000Z",
  );
  assert.equal(
    stockholmLocalToUtc("2027-07-01T00:00"),
    "2027-06-30T22:00:00.000Z",
  );
  assert.equal(
    stockholmLocalToUtc("2027-03-28T03:00"),
    "2027-03-28T01:00:00.000Z",
  );
  assert.equal(
    stockholmLocalToUtc("2027-10-31T03:00:30"),
    "2027-10-31T02:00:30.000Z",
  );
  for (const bad of [
    "2027-03-28T02:30", // spring gap
    "2027-10-31T02:30", // autumn overlap
    "2027-02-30T00:00",
    "2027-01-01",
    "2027-01-01T00:00Z",
    "2027-01-01T24:00",
    "1999-01-01T00:00",
    "",
  ]) {
    assert.equal(stockholmLocalToUtc(bad), null, bad);
  }
});

test("read routes are no-store, allowlist unique parameters and pass parsed input", async () => {
  let listInput;
  const list = createListLicensesRoute({
    async listLicenses(input) {
      listInput = input;
      return { evaluatedAt: null, hasMore: false, items: [], nextCursor: null };
    },
  });
  const ok = await list(
    new Request(
      `https://cc.local/api/licenses?pageSize=10&cursor=abc&tenantId=${TENANT_ID}&status=active&validity=valid&includeTerminated=true&search=alfa`,
    ),
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.deepEqual(listInput, {
    cursor: "abc",
    includeTerminated: true,
    pageSize: 10,
    search: "alfa",
    status: "active",
    tenantId: TENANT_ID,
    validity: "valid",
  });
  for (const query of [
    "?unknown=1",
    "?status=active&status=draft",
    "?pageSize=abc",
    "?pageSize=0",
    "?pageSize=-1",
    "?includeTerminated=yes",
    "?evaluatedAt=2026-01-01",
    "?cursorId=x",
  ]) {
    const response = await list(
      new Request(`https://cc.local/api/licenses${query}`),
    );
    assert.equal(response.status, 422, query);
    assert.equal(
      response.headers.get("cache-control"),
      "private, no-store, max-age=0",
    );
    assert.equal((await response.json()).error.code, "validation_error");
  }

  let termsInput;
  const terms = createListLicenseTermsVersionsRoute({
    async listLicenseTermsVersions(input) {
      termsInput = input;
      return { hasMore: false, items: [], nextCursorVersion: null };
    },
  });
  assert.equal(
    (
      await terms(
        new Request("https://cc.local/x?cursorVersion=3&pageSize=5"),
        context,
      )
    ).status,
    200,
  );
  assert.deepEqual(termsInput, {
    cursorVersion: 3,
    licenseId: LICENSE_ID,
    pageSize: 5,
  });
  assert.equal(
    (await terms(new Request("https://cc.local/x?cursorId=1"), context)).status,
    422,
  );

  let auditInput;
  const audit = createListLicenseAuditEventsRoute({
    async listLicenseAuditEvents(input) {
      auditInput = input;
      return { hasMore: false, items: [], nextCursor: null };
    },
  });
  const at = "2026-01-01T00:00:00.000001+00:00";
  assert.equal(
    (
      await audit(
        new Request(
          `https://cc.local/x?cursorOccurredAt=${encodeURIComponent(at)}&cursorId=${CORRELATION_ID}`,
        ),
        context,
      )
    ).status,
    200,
  );
  assert.deepEqual(auditInput, {
    cursor: { id: CORRELATION_ID, occurredAt: at },
    licenseId: LICENSE_ID,
    pageSize: undefined,
  });
  assert.equal(
    (
      await audit(
        new Request(`https://cc.local/x?cursorId=${CORRELATION_ID}`),
        context,
      )
    ).status,
    422,
  );
});

test("read routes map service errors stably, mask unexpected errors and keep framework redirects", async () => {
  const expected = {
    audit_failure: 500,
    conflict: 409,
    duplicate_license: 409,
    invalid_state_transition: 409,
    not_found: 404,
    tenant_not_available: 409,
    unauthorized: 403,
    unexpected_error: 500,
    validation_error: 422,
  };
  for (const [code, status] of Object.entries(expected)) {
    const route = createGetLicenseRoute({
      async getLicense() {
        throw new LicenseServiceError(code);
      },
    });
    const response = await route(new Request("https://cc.local/x"), context);
    assert.equal(response.status, status, code);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.equal(typeof body.error.message, "string");
  }
  await quietly(async () => {
    const route = createGetLicenseRoute({
      async getLicense() {
        throw new Error(`raw database detail ${TENANT_ID}`);
      },
    });
    const response = await route(new Request("https://cc.local/x"), context);
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), new RegExp(TENANT_ID));
  });
  const redirecting = createListLicensesRoute({
    listLicenses: async () => redirect("/auth/owner-check"),
  });
  await assert.rejects(
    redirecting(new Request("https://cc.local/api/licenses")),
    (error) => error?.digest?.startsWith("NEXT_REDIRECT") === true,
  );
});

function actionHarness(result) {
  const calls = [];
  const license = { id: LICENSE_ID, revision: 7 };
  const service = (name) => async (input) => {
    calls.push({ input, name });
    if (result instanceof Error) throw result;
    return license;
  };
  const core = createLicenseActionCore({
    createCorrelationId: () => CORRELATION_ID,
    rethrowControlFlow(error) {
      if (error?.message === "NEXT_REDIRECT") throw error;
    },
    services: Object.fromEntries(
      [
        "activateLicense",
        "changeLicenseTerms",
        "createLicense",
        "renewLicense",
        "suspendLicense",
        "terminateLicense",
      ].map((name) => [name, service(name)]),
    ),
  });
  return { calls, core };
}

test("actions read only allowlisted fields, convert Stockholm time and use server correlation", async () => {
  const { calls, core } = actionHarness();
  assert.deepEqual(
    await core.createLicense(
      form([
        ["tenantId", TENANT_ID],
        ["planKey", "standard"],
        ["validFrom", "2027-01-01T00:00"],
        ["validUntil", ""],
        ["maxActiveUsers", "1000"],
        ["correlationId", "client-chosen"],
        ["$ACTION_ID_abc", ""],
      ]),
    ),
    { licenseId: LICENSE_ID, ok: true, revision: 7 },
  );
  assert.deepEqual(calls[0], {
    input: {
      correlationId: CORRELATION_ID,
      planKey: "standard",
      tenantId: TENANT_ID,
      validFrom: "2026-12-31T23:00:00.000Z",
      validUntil: null,
    },
    name: "createLicense",
  });
  for (const name of [
    "activateLicense",
    "suspendLicense",
    "terminateLicense",
  ]) {
    await core[name](
      form([
        ["licenseId", LICENSE_ID],
        ["expectedRevision", "3"],
      ]),
    );
    assert.deepEqual(calls.at(-1), {
      input: {
        correlationId: CORRELATION_ID,
        expectedRevision: 3,
        licenseId: LICENSE_ID,
      },
      name,
    });
  }
  await core.changeLicenseTerms(
    form([
      ["licenseId", LICENSE_ID],
      ["expectedRevision", "4"],
      ["planKey", "stor"],
    ]),
  );
  assert.deepEqual(calls.at(-1).input, {
    correlationId: CORRELATION_ID,
    expectedRevision: 4,
    licenseId: LICENSE_ID,
    planKey: "stor",
    validFrom: null,
    validUntil: null,
  });
  await core.renewLicense(
    form([
      ["licenseId", LICENSE_ID],
      ["expectedRevision", "5"],
      ["openEnded", "true"],
    ]),
  );
  assert.deepEqual(calls.at(-1).input, {
    correlationId: CORRELATION_ID,
    expectedRevision: 5,
    licenseId: LICENSE_ID,
    validUntil: null,
  });
  await core.renewLicense(
    form([
      ["licenseId", LICENSE_ID],
      ["expectedRevision", "5"],
      ["validUntil", "2028-07-01T12:00"],
    ]),
  );
  assert.equal(calls.at(-1).input.validUntil, "2028-07-01T10:00:00.000Z");
});

test("actions return field errors without calling services for invalid forms", async () => {
  const cases = [
    [
      "createLicense",
      [
        ["tenantId", "x"],
        ["planKey", "mini"],
      ],
      "tenantId",
    ],
    [
      "createLicense",
      [
        ["tenantId", TENANT_ID],
        ["planKey", "huge"],
      ],
      "planKey",
    ],
    [
      "createLicense",
      [
        ["tenantId", TENANT_ID],
        ["planKey", "mini"],
        ["validFrom", "2027-03-28T02:30"],
      ],
      "validFrom",
    ],
    [
      "createLicense",
      [
        ["tenantId", TENANT_ID],
        ["planKey", "mini"],
        ["validUntil", "2027-10-31T02:30"],
      ],
      "validUntil",
    ],
    [
      "createLicense",
      [
        ["tenantId", TENANT_ID],
        ["planKey", "mini"],
        ["validFrom", "2027-02-01T00:00"],
        ["validUntil", "2027-01-01T00:00"],
      ],
      "validUntil",
    ],
    [
      "createLicense",
      [
        ["tenantId", TENANT_ID],
        ["tenantId", TENANT_ID],
        ["planKey", "mini"],
      ],
      "tenantId",
    ],
    [
      "activateLicense",
      [
        ["licenseId", LICENSE_ID],
        ["expectedRevision", "0"],
      ],
      "expectedRevision",
    ],
    [
      "activateLicense",
      [
        ["licenseId", LICENSE_ID],
        ["expectedRevision", "1.5"],
      ],
      "expectedRevision",
    ],
    [
      "activateLicense",
      [
        ["licenseId", LICENSE_ID],
        ["expectedRevision", "99999999999999999999"],
      ],
      "expectedRevision",
    ],
    ["suspendLicense", [["expectedRevision", "1"]], "licenseId"],
    [
      "renewLicense",
      [
        ["licenseId", LICENSE_ID],
        ["expectedRevision", "1"],
      ],
      "validUntil",
    ],
    [
      "renewLicense",
      [
        ["licenseId", LICENSE_ID],
        ["expectedRevision", "1"],
        ["openEnded", "true"],
        ["validUntil", "2028-01-01T00:00"],
      ],
      "validUntil",
    ],
    [
      "renewLicense",
      [
        ["licenseId", LICENSE_ID],
        ["expectedRevision", "1"],
        ["openEnded", "on"],
      ],
      "openEnded",
    ],
  ];
  for (const [action, entries, field] of cases) {
    const { calls, core } = actionHarness();
    const result = await core[action](form(entries));
    assert.equal(result.ok, false, `${action} ${field}`);
    assert.equal(result.code, "validation_error");
    assert.ok(result.fieldErrors?.[field]?.length, `${action} ${field}`);
    assert.equal(calls.length, 0);
  }
  const file = new FormData();
  file.append("planKey", new Blob(["mini"]), "plan.txt");
  file.append("tenantId", TENANT_ID);
  const { core } = actionHarness();
  assert.equal((await core.createLicense(file)).fieldErrors.planKey.length, 1);
});

test("action service errors map to masked Swedish messages and redirects pass through", async () => {
  for (const code of [
    "conflict",
    "invalid_state_transition",
    "tenant_not_available",
    "duplicate_license",
    "not_found",
    "audit_failure",
    "unauthorized",
  ]) {
    const { core } = actionHarness(new LicenseServiceError(code));
    const result = await core.suspendLicense(
      form([
        ["licenseId", LICENSE_ID],
        ["expectedRevision", "1"],
      ]),
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(result.fieldErrors, undefined);
    assert.match(result.message, /\p{L}/u);
  }
  const validation = await actionHarness(
    new LicenseServiceError("validation_error"),
  ).core.renewLicense(
    form([
      ["licenseId", LICENSE_ID],
      ["expectedRevision", "1"],
      ["openEnded", "true"],
    ]),
  );
  assert.deepEqual(validation.fieldErrors, {
    form: ["Kontrollera angivna uppgifter."],
  });
  await quietly(async () => {
    const result = await actionHarness(
      new Error(`secret ${TENANT_ID}`),
    ).core.terminateLicense(
      form([
        ["licenseId", LICENSE_ID],
        ["expectedRevision", "1"],
      ]),
    );
    assert.equal(result.code, "unexpected_error");
    assert.doesNotMatch(JSON.stringify(result), new RegExp(TENANT_ID));
  });
  await assert.rejects(
    actionHarness(new Error("NEXT_REDIRECT")).core.activateLicense(
      form([
        ["licenseId", LICENSE_ID],
        ["expectedRevision", "1"],
      ]),
    ),
    /NEXT_REDIRECT/,
  );
});

test("licensing HTTP surface is exactly four no-store GET read routes; no eligibility route or actions yet", async () => {
  const root = new URL("../app/api/licenses/", import.meta.url);
  const files = (await readdir(root, { recursive: true }))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => name.replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(files, [
    "[licenseId]/audit/route.ts",
    "[licenseId]/route.ts",
    "[licenseId]/terms/route.ts",
    "route.ts",
  ]);
  for (const file of files) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.match(source, /^import "server-only";/);
    assert.match(source, /export const dynamic = "force-dynamic";/);
    assert.match(source, /export const revalidate = 0;/);
    assert.deepEqual(
      [...source.matchAll(/export const (\w+)/g)].map((m) => m[1]),
      ["dynamic", "revalidate", "GET"],
    );
    assert.doesNotMatch(source, /eligibility|POST|PUT|PATCH|DELETE/i);
  }
  await assert.rejects(readdir(new URL("../app/licenses/", import.meta.url)), {
    code: "ENOENT",
  });
});
