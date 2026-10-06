import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { decodeLicenseListCursor } from "../lib/server/licenses/license-cursor.ts";
import {
  LicenseServiceError,
  mapLicenseDatabaseError,
} from "../lib/server/licenses/license.errors.ts";
import {
  mapLicenseAuditPage,
  mapLicenseEligibility,
  mapLicenseListPage,
  mapLicenseTermsPage,
} from "../lib/server/licenses/license.mapper.ts";
import { createLicenseRepository } from "../lib/server/licenses/license.repository.ts";
import { createLicenseService } from "../lib/server/licenses/license.service-core.ts";
import {
  compareTimestamps,
  timestampMicros,
} from "../lib/server/licenses/license.validation.ts";

const LICENSE_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_LICENSE_ID = "20000000-0000-4000-8000-000000000002";
const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const INSTALLATION_ID = "30000000-0000-4000-8000-000000000001";
const OWNER_ID = "00000000-0000-4000-8000-000000000051";
const EVENT_ID = "40000000-0000-4000-8000-000000000001";
const EVALUATED_AT = "2026-10-06T08:00:00.123456+00:00";
const DEFAULT_FILTER = Object.freeze({
  includeTerminated: false,
  search: null,
  status: null,
  tenantId: null,
  validity: null,
});

const licenseRow = Object.freeze({
  created_at: "2026-01-01T00:00:00.000001+00:00",
  created_by: OWNER_ID,
  current_terms_version: 1,
  id: LICENSE_ID,
  revision: 2,
  status: "active",
  tenant_id: TENANT_ID,
  updated_at: "2026-01-02T00:00:00+00:00",
  updated_by: OWNER_ID,
});
function listRow(overrides = {}) {
  return {
    created_at: "2026-01-01T00:00:00.000002+00:00",
    current_terms_version: 1,
    evaluated_at: EVALUATED_AT,
    has_more: false,
    id: LICENSE_ID,
    max_active_users: 24,
    next_cursor_created_at: null,
    next_cursor_id: null,
    plan_display_label: "Mini",
    plan_key: "mini",
    revision: 2,
    status: "active",
    tenant_id: TENANT_ID,
    tenant_legal_name: "Alfa AB",
    updated_at: "2026-01-02T00:00:00+00:00",
    valid_from: "2026-01-01T00:00:00+00:00",
    valid_until: null,
    validity: "valid",
    ...overrides,
  };
}
function termsRow(overrides = {}) {
  return {
    has_more: false,
    introduced_at: "2026-01-01T00:00:00+00:00",
    introduced_at_revision: 1,
    license_id: LICENSE_ID,
    max_active_users: 24,
    next_cursor_version: null,
    plan_display_label: "Mini",
    plan_key: "mini",
    plan_version: 1,
    valid_from: "2026-01-01T00:00:00+00:00",
    valid_until: null,
    version: 1,
    ...overrides,
  };
}
function auditRow(overrides = {}) {
  return {
    actor_user_id: OWNER_ID,
    changed_fields: ["status", "revision", "updated_at", "updated_by"],
    correlation_id: null,
    event_type: "license_activated",
    has_more: false,
    id: EVENT_ID,
    license_id: LICENSE_ID,
    next_cursor_id: null,
    next_cursor_occurred_at: null,
    occurred_at: "2026-01-02T00:00:00+00:00",
    revision_after: 2,
    revision_before: 1,
    ...overrides,
  };
}
function eligibilityRow(overrides = {}) {
  return {
    eligible: true,
    evaluated_at: EVALUATED_AT,
    license_id: LICENSE_ID,
    reason: "eligible",
    revision: 2,
    terms_version: 1,
    valid_until: null,
    ...overrides,
  };
}

function silenceErrors() {
  const original = console.error;
  const lines = [];
  console.error = (line) => lines.push(String(line));
  return {
    lines,
    restore() {
      console.error = original;
    },
  };
}
async function expectCode(promiseOrFn, code) {
  const quiet = silenceErrors();
  try {
    await assert.rejects(
      async () =>
        typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn,
      (error) => {
        assert.equal(error instanceof LicenseServiceError, true);
        assert.equal(error.code, code);
        return true;
      },
    );
  } finally {
    quiet.restore();
  }
}

// A repository whose every method records calls and returns a fixed result.
function fakeRepository(result = { data: [], error: null }) {
  const calls = [];
  const methods = [
    "activateLicense",
    "changeLicenseTerms",
    "createLicense",
    "getLicense",
    "getProvisioningEligibility",
    "listLicenseAuditEvents",
    "listLicenseTermsVersions",
    "listLicenses",
    "renewLicense",
    "suspendLicense",
    "terminateLicense",
  ];
  const repository = Object.fromEntries(
    methods.map((name) => [
      name,
      async (input) => {
        calls.push({ input, name });
        return typeof result === "function" ? result(name, input) : result;
      },
    ]),
  );
  return { calls, repository };
}
function serviceWith(
  result,
  requireOwner = async () => ({ userId: OWNER_ID }),
) {
  const fake = fakeRepository(result);
  let repositoriesCreated = 0;
  const service = createLicenseService({
    getRepository: async () => {
      repositoriesCreated += 1;
      return fake.repository;
    },
    requireOwner,
  });
  return {
    ...fake,
    repositoriesCreated: () => repositoriesCreated,
    service,
  };
}

const SERVICE_CALLS = [
  ["listLicenses", {}],
  ["getLicense", LICENSE_ID],
  ["listLicenseTermsVersions", { licenseId: LICENSE_ID }],
  ["listLicenseAuditEvents", { licenseId: LICENSE_ID }],
  ["getProvisioningEligibility", { tenantId: TENANT_ID }],
  ["createLicense", { planKey: "mini", tenantId: TENANT_ID }],
  ["activateLicense", { expectedRevision: 1, licenseId: LICENSE_ID }],
  ["suspendLicense", { expectedRevision: 1, licenseId: LICENSE_ID }],
  ["terminateLicense", { expectedRevision: 1, licenseId: LICENSE_ID }],
  [
    "changeLicenseTerms",
    { expectedRevision: 1, licenseId: LICENSE_ID, planKey: "stor" },
  ],
  [
    "renewLicense",
    { expectedRevision: 1, licenseId: LICENSE_ID, validUntil: null },
  ],
];

test("licensing production boundary is server-only, RPC-only and exposes no repository or browser path", async () => {
  const files = [
    "index.ts",
    "license-action-core.ts",
    "license-cursor.ts",
    "license-read-route.ts",
    "license-time.ts",
    "license.errors.ts",
    "license.mapper.ts",
    "license.repository.ts",
    "license.service-core.ts",
    "license.service.ts",
    "license.types.ts",
    "license.validation.ts",
  ];
  for (const file of files) {
    const source = await readFile(
      new URL(`../lib/server/licenses/${file}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /^import "server-only";/, file);
    assert.doesNotMatch(source, /createBrowserClient|service[_ -]?role/i, file);
  }
  const repository = await readFile(
    new URL("../lib/server/licenses/license.repository.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(repository, /\.from\(|\.insert\(|\.update\(|\.delete\(/);
  const rpcs = [...repository.matchAll(/"([a-z_]+)"/g)]
    .map((match) => match[1])
    .filter((name) => name.includes("license"));
  assert.deepEqual([...new Set(rpcs)].sort(), [
    "activate_license",
    "change_license_terms",
    "create_license",
    "get_license",
    "get_license_provisioning_eligibility",
    "list_license_audit_events",
    "list_license_terms_versions",
    "list_licenses",
    "renew_license",
    "suspend_license",
    "terminate_license",
  ]);
  const service = await readFile(
    new URL("../lib/server/licenses/license.service.ts", import.meta.url),
    "utf8",
  );
  assert.match(service, /requireOwner: requireOwnerIntegrity/);
  assert.match(service, /createSupabaseServerClient\(\)/);
  const index = await readFile(
    new URL("../lib/server/licenses/index.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(index, /repository|mapper|license-cursor/i);
});

test("owner guard runs before validation and before any repository for every operation", async () => {
  for (const [method, input] of SERVICE_CALLS) {
    const denied = new Error("guard denied");
    const harness = serviceWith(undefined, async () => {
      throw denied;
    });
    await assert.rejects(harness.service[method](input), denied, method);
    await assert.rejects(harness.service[method]("not-valid"), denied, method);
    assert.equal(harness.repositoriesCreated(), 0, method);
    assert.equal(harness.calls.length, 0, method);
  }
});

test("invalid input is rejected before the repository is called", async () => {
  const cases = [
    ["listLicenses", { pageSize: 0 }],
    ["listLicenses", { pageSize: 101 }],
    ["listLicenses", { pageSize: 1.5 }],
    ["listLicenses", { status: "expired" }],
    ["listLicenses", { status: "terminated" }],
    ["listLicenses", { validity: "active" }],
    ["listLicenses", { includeTerminated: "true" }],
    ["listLicenses", { tenantId: "not-a-uuid" }],
    ["listLicenses", { tenantId: "ABCDEF00-0000-4000-8000-000000000001" }],
    ["listLicenses", { search: "a".repeat(201) }],
    ["listLicenses", { search: "😀".repeat(201) }],
    ["listLicenses", { cursor: "not a token" }],
    ["listLicenses", { cursor: 1 }],
    ["getLicense", "not-a-uuid"],
    ["listLicenseTermsVersions", { licenseId: LICENSE_ID, cursorVersion: 0 }],
    ["listLicenseTermsVersions", { licenseId: LICENSE_ID, pageSize: 101 }],
    [
      "listLicenseAuditEvents",
      {
        cursor: { id: EVENT_ID, occurredAt: "2026-01-01" },
        licenseId: LICENSE_ID,
      },
    ],
    ["getProvisioningEligibility", { tenantId: null }],
    [
      "getProvisioningEligibility",
      { installationId: "x", tenantId: TENANT_ID },
    ],
    ["createLicense", { planKey: "huge", tenantId: TENANT_ID }],
    [
      "createLicense",
      {
        planKey: "mini",
        tenantId: TENANT_ID,
        validFrom: "2027-01-01T00:00:00",
      },
    ],
    [
      "createLicense",
      {
        planKey: "mini",
        tenantId: TENANT_ID,
        validFrom: "2027-01-02T00:00:00Z",
        validUntil: "2027-01-01T00:00:00Z",
      },
    ],
    [
      "createLicense",
      { planKey: "mini", tenantId: TENANT_ID, correlationId: "client" },
    ],
    ["activateLicense", { expectedRevision: 0, licenseId: LICENSE_ID }],
    ["suspendLicense", { expectedRevision: "1", licenseId: LICENSE_ID }],
    ["changeLicenseTerms", { expectedRevision: 1, licenseId: LICENSE_ID }],
    ["renewLicense", { expectedRevision: 1, licenseId: LICENSE_ID }],
    [
      "renewLicense",
      { expectedRevision: 1, licenseId: LICENSE_ID, validUntil: undefined },
    ],
  ];
  for (const [method, input] of cases) {
    const harness = serviceWith();
    await expectCode(harness.service[method](input), "validation_error");
    assert.equal(harness.calls.length, 0, `${method} ${JSON.stringify(input)}`);
  }
  const harness = serviceWith({ data: [], error: null });
  await harness.service.listLicenses({ search: "😀".repeat(200) });
  assert.equal(harness.calls.length, 1, "200 code points are accepted");
});

test("repository sends only intended RPC arguments, preserving timestamp text and explicit renewal NULL", async () => {
  const calls = [];
  const client = {
    from() {
      throw new Error("table access is not allowed");
    },
    async rpc(name, args) {
      calls.push({ args, name });
      return { data: [], error: null };
    },
  };
  const repository = createLicenseRepository(client);
  await repository.listLicenses({
    filter: DEFAULT_FILTER,
    pageSize: 50,
    position: null,
  });
  await repository.listLicenses({
    filter: { ...DEFAULT_FILTER, search: "alfa", status: "active" },
    pageSize: 2,
    position: {
      createdAt: "2026-01-01T00:00:00.000001+00:00",
      evaluatedAt: EVALUATED_AT,
      id: LICENSE_ID,
    },
  });
  await repository.createLicense({ planKey: "mini", tenantId: TENANT_ID });
  await repository.changeLicenseTerms({
    correlationId: EVENT_ID,
    expectedRevision: 2,
    licenseId: LICENSE_ID,
    planKey: "stor",
    validFrom: null,
    validUntil: null,
  });
  await repository.renewLicense({
    expectedRevision: 3,
    licenseId: LICENSE_ID,
    validUntil: null,
  });
  await repository.getProvisioningEligibility({
    installationId: null,
    tenantId: TENANT_ID,
  });
  const json = calls.map(({ args, name }) => ({
    args: JSON.parse(JSON.stringify(args)),
    name,
  }));
  assert.deepEqual(json, [
    {
      args: { p_include_terminated: false, p_page_size: 50 },
      name: "list_licenses",
    },
    {
      args: {
        p_cursor_created_at: "2026-01-01T00:00:00.000001+00:00",
        p_cursor_id: LICENSE_ID,
        p_evaluated_at: EVALUATED_AT,
        p_include_terminated: false,
        p_page_size: 2,
        p_search: "alfa",
        p_status: "active",
      },
      name: "list_licenses",
    },
    {
      args: { p_plan_key: "mini", p_tenant_id: TENANT_ID },
      name: "create_license",
    },
    {
      args: {
        p_correlation_id: EVENT_ID,
        p_expected_revision: 2,
        p_license_id: LICENSE_ID,
        p_plan_key: "stor",
      },
      name: "change_license_terms",
    },
    {
      args: {
        p_expected_revision: 3,
        p_license_id: LICENSE_ID,
        p_valid_until: null,
      },
      name: "renew_license",
    },
    {
      args: { p_tenant_id: TENANT_ID },
      name: "get_license_provisioning_eligibility",
    },
  ]);
});

test("stable database codes map exactly and anything else is masked without payload in logs", async () => {
  for (const code of [
    "unauthorized",
    "not_found",
    "conflict",
    "validation_error",
    "invalid_state_transition",
    "tenant_not_available",
    "duplicate_license",
    "audit_failure",
  ]) {
    assert.equal(mapLicenseDatabaseError({ message: code }).code, code);
  }
  const quiet = silenceErrors();
  try {
    const error = mapLicenseDatabaseError({
      code: "23514",
      message: `license history integrity violation ${OWNER_ID}`,
    });
    assert.equal(error.code, "unexpected_error");
    assert.equal(quiet.lines.length, 1);
    const logged = JSON.parse(quiet.lines[0]);
    assert.deepEqual(Object.keys(logged).sort(), [
      "code",
      "correlationId",
      "event",
      "timestamp",
    ]);
    assert.doesNotMatch(quiet.lines[0], new RegExp(OWNER_ID));
    assert.equal(
      mapLicenseDatabaseError({ message: "unexpected_error" }).code,
      "unexpected_error",
    );
  } finally {
    quiet.restore();
  }
});

test("timestamps compare at microsecond precision across offsets", () => {
  assert.equal(
    compareTimestamps(
      "2026-01-01T00:00:00.000001+00:00",
      "2026-01-01T00:00:00.000002+00:00",
    ),
    -1,
  );
  assert.equal(
    compareTimestamps("2026-01-01T01:00:00+01:00", "2026-01-01T00:00:00Z"),
    0,
  );
  for (const bad of [
    "2026-02-30T00:00:00Z",
    "2026-01-01T00:00:00",
    "2026-01-01 00:00:00+00",
    "2026-01-01T00:00:00.1234567Z",
    "infinity",
    "",
  ]) {
    assert.equal(timestampMicros(bad), null, bad);
  }
});

test("list pages validate allowlist, order, derived validity and cursor consistency", async () => {
  const first = listRow({
    created_at: "2026-01-01T00:00:00.000002+00:00",
    has_more: true,
    id: OTHER_LICENSE_ID,
    next_cursor_created_at: "2026-01-01T00:00:00.000001+00:00",
    next_cursor_id: LICENSE_ID,
  });
  const second = listRow({
    created_at: "2026-01-01T00:00:00.000001+00:00",
    has_more: true,
    next_cursor_created_at: "2026-01-01T00:00:00.000001+00:00",
    next_cursor_id: LICENSE_ID,
    status: "draft",
    valid_from: "2027-01-01T00:00:00+00:00",
    validity: "not_started",
  });
  const page = mapLicenseListPage([first, second], DEFAULT_FILTER, null);
  assert.equal(page.evaluatedAt, EVALUATED_AT);
  assert.deepEqual(
    page.items.map((item) => [item.id, item.validity, item.validUntil]),
    [
      [OTHER_LICENSE_ID, "valid", null],
      [LICENSE_ID, "not_started", null],
    ],
  );
  assert.equal(Object.isFrozen(page.items[0]), true);
  assert.equal("createdBy" in page.items[0], false);
  assert.deepEqual(decodeLicenseListCursor(page.nextCursor, DEFAULT_FILTER), {
    createdAt: "2026-01-01T00:00:00.000001+00:00",
    evaluatedAt: EVALUATED_AT,
    id: LICENSE_ID,
  });
  assert.deepEqual(mapLicenseListPage([], DEFAULT_FILTER, null), {
    evaluatedAt: null,
    hasMore: false,
    items: [],
    nextCursor: null,
  });

  const malformed = [
    [[second, first], "microsecond order reversed"],
    [[first, first], "duplicate key"],
    [[listRow(), listRow()], "duplicate key without cursor"],
    [[listRow({ validity: "expired" })], "validity contradicts dates"],
    [[listRow({ status: "terminated" })], "terminated outside filter"],
    [[listRow({ plan_display_label: "Mega" })], "plan snapshot"],
    [[listRow({ max_active_users: 25 })], "capacity snapshot"],
    [[listRow({ current_terms_version: 3 })], "terms version above revision"],
    [[listRow({ has_more: true })], "has_more without cursor"],
    [[listRow({ next_cursor_id: LICENSE_ID })], "cursor on last page"],
    [
      [first, { ...second, evaluated_at: "2026-10-06T08:00:00Z" }],
      "mixed time",
    ],
    [
      [
        { ...first, next_cursor_id: OTHER_LICENSE_ID },
        { ...second, next_cursor_id: OTHER_LICENSE_ID },
      ],
      "cursor not last row",
    ],
    [[listRow({ id: "ABCDEF00-0000-4000-8000-000000000001" })], "uppercase id"],
    [[listRow({ tenant_legal_name: " Alfa" })], "untrimmed legal name"],
    [[listRow({ valid_until: "2026-01-01T00:00:00+00:00" })], "empty interval"],
    [{ not: "an array" }, "not an array"],
  ];
  for (const [value, label] of malformed) {
    await expectCode(
      () => mapLicenseListPage(value, DEFAULT_FILTER, null),
      "unexpected_error",
    ).catch((error) => {
      throw new Error(`${label}: ${error.message}`);
    });
  }
  await expectCode(
    () =>
      mapLicenseListPage(
        [listRow()],
        { ...DEFAULT_FILTER, tenantId: TENANT_ID.replace("1", "9") },
        null,
      ),
    "unexpected_error",
  );
  await expectCode(
    () =>
      mapLicenseListPage([listRow()], DEFAULT_FILTER, "2026-10-06T07:00:00Z"),
    "unexpected_error",
  );
});

test("list cursor is opaque, bound to the series and the full filter, and rejects tampering", async () => {
  const pages = [
    [
      listRow({
        has_more: true,
        next_cursor_created_at: "2026-01-01T00:00:00.000002+00:00",
        next_cursor_id: LICENSE_ID,
      }),
    ],
    [],
  ];
  const harness = serviceWith(() => ({ data: pages.shift(), error: null }));
  const filter = { search: "  alfa ", status: "active" };
  const page = await harness.service.listLicenses({ ...filter, pageSize: 1 });
  assert.match(page.nextCursor, /^[A-Za-z0-9_-]+$/);
  const next = await harness.service.listLicenses({
    ...filter,
    cursor: page.nextCursor,
    pageSize: 1,
  });
  assert.equal(
    next.evaluatedAt,
    EVALUATED_AT,
    "empty continuation keeps series time",
  );
  assert.deepEqual(harness.calls[1].input.position, {
    createdAt: "2026-01-01T00:00:00.000002+00:00",
    evaluatedAt: EVALUATED_AT,
    id: LICENSE_ID,
  });
  assert.equal(harness.calls[1].input.filter.search, "alfa");

  for (const changed of [
    { ...filter, status: null },
    { ...filter, search: "beta" },
    { ...filter, includeTerminated: true },
    { ...filter, tenantId: TENANT_ID },
    { ...filter, validity: "valid" },
  ]) {
    const check = serviceWith();
    await expectCode(
      check.service.listLicenses({ ...changed, cursor: page.nextCursor }),
      "validation_error",
    );
    assert.equal(check.calls.length, 0);
  }
  const decoded = JSON.parse(Buffer.from(page.nextCursor, "base64url"));
  const tampered = [
    { ...decoded, v: 2 },
    { ...decoded, i: "not-a-uuid" },
    { ...decoded, e: "2026-10-06" },
    { ...decoded, extra: true },
    { ...decoded, f: { ...decoded.f, q: " alfa" } },
  ].map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"));
  for (const token of [...tampered, page.nextCursor + "=", "x".repeat(2049)]) {
    const check = serviceWith();
    await expectCode(
      check.service.listLicenses({ ...filter, cursor: token }),
      "validation_error",
    );
    assert.equal(check.calls.length, 0);
  }
});

test("detail requires exactly the requested license", async () => {
  const detail = {
    ...listRow(),
    has_more: undefined,
    plan_version: 1,
  };
  delete detail.has_more;
  const harness = serviceWith({ data: [detail], error: null });
  const result = await harness.service.getLicense(LICENSE_ID);
  assert.equal(result.evaluatedAt, EVALUATED_AT);
  assert.equal(result.planVersion, 1);
  for (const data of [
    [],
    [detail, detail],
    [{ ...detail, id: OTHER_LICENSE_ID }],
    [{ ...detail, plan_version: 2 }],
  ]) {
    const check = serviceWith({ data, error: null });
    await expectCode(check.service.getLicense(LICENSE_ID), "unexpected_error");
  }
  const missing = serviceWith({ data: null, error: { message: "not_found" } });
  await expectCode(missing.service.getLicense(LICENSE_ID), "not_found");
});

test("terms history is license-bound, strictly version DESC and below the cursor", async () => {
  const page = mapLicenseTermsPage(
    [
      termsRow({
        has_more: true,
        introduced_at_revision: 3,
        next_cursor_version: 2,
        plan_display_label: "Stor",
        plan_key: "stor",
        max_active_users: 100,
        version: 3,
      }),
      termsRow({
        has_more: true,
        introduced_at_revision: 2,
        next_cursor_version: 2,
        version: 2,
      }),
    ],
    LICENSE_ID,
    null,
  );
  assert.deepEqual(
    page.items.map((item) => [item.version, item.planKey, item.maxActiveUsers]),
    [
      [3, "stor", 100],
      [2, "mini", 24],
    ],
  );
  assert.equal(page.nextCursorVersion, 2);
  for (const [rows, cursor] of [
    [[termsRow({ license_id: OTHER_LICENSE_ID })], null],
    [[termsRow({ version: 1 }), termsRow({ version: 2 })], null],
    [[termsRow({ version: 2, introduced_at_revision: 2 })], 2],
    [[termsRow({ introduced_at_revision: 0 })], null],
    [[termsRow({ has_more: true, next_cursor_version: 5 })], null],
  ]) {
    await expectCode(
      () => mapLicenseTermsPage(rows, LICENSE_ID, cursor),
      "unexpected_error",
    );
  }
});

test("audit pages validate canonical metadata, revision chain and license scope", async () => {
  const page = mapLicenseAuditPage(
    [
      auditRow({
        changed_fields: [
          "revision",
          "current_terms_version",
          "valid_until",
          "updated_at",
          "updated_by",
        ],
        event_type: "license_renewed",
        id: "40000000-0000-4000-8000-000000000003",
        occurred_at: "2026-01-03T00:00:00+00:00",
        revision_after: 3,
        revision_before: 2,
      }),
      auditRow(),
    ],
    LICENSE_ID,
  );
  assert.deepEqual(
    page.items.map((item) => item.eventType),
    ["license_renewed", "license_activated"],
  );
  assert.equal(page.items[0].actorUserId, OWNER_ID);
  for (const row of [
    auditRow({ license_id: OTHER_LICENSE_ID }),
    auditRow({ changed_fields: ["revision", "status"] }),
    auditRow({ changed_fields: ["status", "status"] }),
    auditRow({ changed_fields: ["price"] }),
    auditRow({ changed_fields: [] }),
    auditRow({ revision_before: null }),
    auditRow({ event_type: "license_created", revision_before: null }),
    auditRow({ revision_after: 3 }),
    auditRow({ event_type: "license_deleted" }),
    auditRow({ correlation_id: "not-a-uuid" }),
  ]) {
    await expectCode(
      () => mapLicenseAuditPage([row], LICENSE_ID),
      "unexpected_error",
    );
  }
});

test("eligibility returns evaluated results, domain errors, or a separate technical read error", async () => {
  const evaluated = await serviceWith({
    data: [eligibilityRow({ valid_until: "2027-01-01T00:00:00+00:00" })],
    error: null,
  }).service.getProvisioningEligibility({
    installationId: INSTALLATION_ID,
    tenantId: TENANT_ID,
  });
  assert.equal(evaluated.kind, "evaluated");
  assert.equal(evaluated.eligibility.eligible, true);
  assert.equal(evaluated.eligibility.validUntil, "2027-01-01T00:00:00+00:00");
  for (const reason of [
    "missing_license",
    "tenant_unavailable",
    "tenant_installation_mismatch",
  ]) {
    assert.deepEqual(
      mapLicenseEligibility([
        eligibilityRow({
          eligible: false,
          license_id: null,
          reason,
          revision: null,
          terms_version: null,
        }),
      ]),
      {
        eligible: false,
        evaluatedAt: EVALUATED_AT,
        licenseId: null,
        reason,
        revision: null,
        termsVersion: null,
        validUntil: null,
      },
    );
  }
  for (const code of ["unauthorized", "validation_error", "not_found"]) {
    await expectCode(
      serviceWith({
        data: null,
        error: { message: code },
      }).service.getProvisioningEligibility({ tenantId: TENANT_ID }),
      code,
    );
  }
  const technical = [
    { data: null, error: { message: "connection reset" } },
    { data: [eligibilityRow({ reason: "draft" })], error: null },
    {
      data: [eligibilityRow({ eligible: false, reason: "missing_license" })],
      error: null,
    },
    { data: [eligibilityRow({ reason: "usage_ok" })], error: null },
    {
      data: [eligibilityRow({ valid_until: "2026-01-01T00:00:00+00:00" })],
      error: null,
    },
    { data: [], error: null },
    { data: [eligibilityRow(), eligibilityRow()], error: null },
    () => {
      throw new Error("network");
    },
  ];
  for (const result of technical) {
    const quiet = silenceErrors();
    try {
      const outcome = await serviceWith(
        result,
      ).service.getProvisioningEligibility({ tenantId: TENANT_ID });
      assert.equal(outcome.kind, "technical_read_error");
      assert.equal("eligibility" in outcome, false);
      assert.equal("eligible" in outcome, false);
      assert.match(outcome.correlationId, /^[0-9a-f-]{36}$/);
      assert.equal(
        JSON.parse(quiet.lines.at(-1)).correlationId,
        outcome.correlationId,
      );
    } finally {
      quiet.restore();
    }
  }
});

test("mutations return the validated license DTO and map database outcomes", async () => {
  const harness = serviceWith({ data: licenseRow, error: null });
  const license = await harness.service.renewLicense({
    correlationId: EVENT_ID,
    expectedRevision: 1,
    licenseId: LICENSE_ID,
    validUntil: "2027-01-01T00:00:00Z",
  });
  assert.deepEqual(license, {
    createdAt: licenseRow.created_at,
    currentTermsVersion: 1,
    id: LICENSE_ID,
    revision: 2,
    status: "active",
    tenantId: TENANT_ID,
    updatedAt: licenseRow.updated_at,
  });
  assert.equal(harness.calls[0].input.validUntil, "2027-01-01T00:00:00Z");
  for (const code of [
    "conflict",
    "invalid_state_transition",
    "tenant_not_available",
    "duplicate_license",
    "audit_failure",
  ]) {
    await expectCode(
      serviceWith({
        data: null,
        error: { message: code },
      }).service.activateLicense({
        expectedRevision: 1,
        licenseId: LICENSE_ID,
      }),
      code,
    );
  }
  for (const data of [
    null,
    { ...licenseRow, status: "expired" },
    { ...licenseRow, updated_at: "2025-01-01T00:00:00Z" },
  ]) {
    await expectCode(
      serviceWith({ data, error: null }).service.suspendLicense({
        expectedRevision: 1,
        licenseId: LICENSE_ID,
      }),
      "unexpected_error",
    );
  }
});
