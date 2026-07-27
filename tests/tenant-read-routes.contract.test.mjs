import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createGetTenantRoute,
  createListTenantAuditEventsRoute,
  createListTenantsRoute,
} from "../lib/server/tenants/tenant-read-route.ts";
import { TenantServiceError } from "../lib/server/tenants/tenant.errors.ts";
import { validateAuditListInput } from "../lib/server/tenants/tenant.validation.ts";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const EVENT_ID = "00000000-0000-4000-8000-000000000201";
const OCCURRED_AT = "2026-07-27T12:00:00.000Z";

const tenant = Object.freeze({
  administrativeNote: null,
  archivedAt: null,
  archivedBy: null,
  category: "customer",
  contactEmail: null,
  contactName: null,
  contactPhone: null,
  countryCode: "SE",
  createdAt: OCCURRED_AT,
  createdBy: "00000000-0000-4000-8000-000000000001",
  id: TENANT_ID,
  legalName: "Exempel AB",
  operationalStatus: "active",
  organizationNumber: "556016-0680",
  revision: 1,
  updatedAt: OCCURRED_AT,
  updatedBy: "00000000-0000-4000-8000-000000000001",
});

const auditPage = Object.freeze({
  hasMore: true,
  items: Object.freeze([
    Object.freeze({
      actorUserId: "00000000-0000-4000-8000-000000000001",
      changedFields: Object.freeze(["legal_name"]),
      correlationId: null,
      eventType: "tenant_edited",
      id: EVENT_ID,
      occurredAt: OCCURRED_AT,
      revisionAfter: 2,
      revisionBefore: 1,
      tenantId: TENANT_ID,
    }),
  ]),
  nextCursor: Object.freeze({ id: EVENT_ID, occurredAt: OCCURRED_AT }),
});

const context = (tenantId = TENANT_ID) => ({
  params: Promise.resolve({ tenantId }),
});

async function body(response) {
  return response.json();
}

function assertPrivateNoStore(response) {
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
}

test("read routes are server-only, dynamic, service-only and mutation-free", async () => {
  const routeFiles = [
    "../app/api/tenants/route.ts",
    "../app/api/tenants/[tenantId]/route.ts",
    "../app/api/tenants/[tenantId]/audit/route.ts",
  ];

  for (const relativePath of routeFiles) {
    const source = await readFile(
      new URL(relativePath, import.meta.url),
      "utf8",
    );
    assert.match(source, /^import "server-only";/);
    assert.match(source, /dynamic = "force-dynamic"/);
    assert.match(source, /revalidate = 0/);
    assert.match(source, /@\/lib\/server\/tenants/);
    assert.doesNotMatch(
      source,
      /supabase|createBrowserClient|service_role|\.from\(|\.rpc\(|POST|PATCH|DELETE/,
    );
  }
});

test("list route calls the service once and returns its exact typed model", async () => {
  let calls = 0;
  const GET = createListTenantsRoute({
    listTenants: async () => {
      calls += 1;
      return [tenant];
    },
  });

  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), [tenant]);
  assert.equal(calls, 1);
  assertPrivateNoStore(response);
});

test("list route maps stable errors and masks unexpected failures", async () => {
  for (const [code, status] of [
    ["unauthorized", 403],
    ["not_found", 404],
    ["conflict", 409],
    ["invalid_state_transition", 409],
    ["validation_error", 422],
    ["audit_failure", 500],
    ["unexpected_error", 500],
  ]) {
    const GET = createListTenantsRoute({
      listTenants: async () => {
        throw new TenantServiceError(code);
      },
    });
    const response = await GET();
    assert.equal(response.status, status);
    assert.deepEqual(await body(response), { error: code });
    assertPrivateNoStore(response);
  }

  const raw = new Error(`sensitive ${TENANT_ID}`);
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await createListTenantsRoute({
      listTenants: async () => {
        throw raw;
      },
    })();
    assert.equal(response.status, 500);
    const payload = await body(response);
    assert.deepEqual(payload, { error: "unexpected_error" });
    assert.equal(JSON.stringify(payload).includes(TENANT_ID), false);
  } finally {
    console.error = originalError;
  }
});

test("detail route forwards UUID, supports archived tenants and maps failures", async () => {
  const archivedTenant = {
    ...tenant,
    archivedAt: OCCURRED_AT,
    archivedBy: tenant.createdBy,
  };
  let receivedId;
  const GET = createGetTenantRoute({
    getTenantById: async (tenantId) => {
      receivedId = tenantId;
      return archivedTenant;
    },
  });

  const response = await GET(
    new Request(`http://localhost/api/tenants/${TENANT_ID}`),
    context(),
  );
  assert.equal(receivedId, TENANT_ID);
  assert.deepEqual(await body(response), archivedTenant);

  for (const [tenantId, code, status] of [
    ["invalid", "validation_error", 422],
    [TENANT_ID, "not_found", 404],
    [TENANT_ID, "unauthorized", 403],
    [TENANT_ID, "unexpected_error", 500],
  ]) {
    const failing = createGetTenantRoute({
      getTenantById: async () => {
        throw new TenantServiceError(code);
      },
    });
    const failedResponse = await failing(
      new Request(`http://localhost/api/tenants/${tenantId}`),
      context(tenantId),
    );
    assert.equal(failedResponse.status, status);
    assert.deepEqual(await body(failedResponse), { error: code });
  }
});

test("audit route supports defaults, explicit page size and paired cursor", async () => {
  const inputs = [];
  const GET = createListTenantAuditEventsRoute({
    listTenantAuditEvents: async (input) => {
      inputs.push(input);
      validateAuditListInput(input);
      return auditPage;
    },
  });

  const defaultResponse = await GET(
    new Request(`http://localhost/api/tenants/${TENANT_ID}/audit`),
    context(),
  );
  assert.deepEqual(await body(defaultResponse), auditPage);
  assert.deepEqual(inputs.shift(), {
    cursor: undefined,
    pageSize: undefined,
    tenantId: TENANT_ID,
  });

  const explicitResponse = await GET(
    new Request(
      `http://localhost/api/tenants/${TENANT_ID}/audit?pageSize=25&cursorOccurredAt=${encodeURIComponent(OCCURRED_AT)}&cursorId=${EVENT_ID}`,
    ),
    context(),
  );
  assert.equal(explicitResponse.status, 200);
  assert.deepEqual(inputs.shift(), {
    cursor: { id: EVENT_ID, occurredAt: OCCURRED_AT },
    pageSize: 25,
    tenantId: TENANT_ID,
  });
  assertPrivateNoStore(explicitResponse);
  const payload = await body(explicitResponse);
  assert.deepEqual(Object.keys(payload).sort(), [
    "hasMore",
    "items",
    "nextCursor",
  ]);
  assert.equal(JSON.stringify(payload).includes("has_more"), false);
});

test("audit route maps malformed transport values and service failures", async () => {
  const validatingGET = createListTenantAuditEventsRoute({
    listTenantAuditEvents: async (input) => {
      validateAuditListInput(input);
      return auditPage;
    },
  });

  for (const query of [
    "?pageSize=0",
    "?pageSize=invalid",
    `?cursorId=${EVENT_ID}`,
    `?cursorOccurredAt=${encodeURIComponent(OCCURRED_AT)}`,
  ]) {
    const response = await validatingGET(
      new Request(`http://localhost/api/tenants/${TENANT_ID}/audit${query}`),
      context(),
    );
    assert.equal(response.status, 422);
    assert.deepEqual(await body(response), { error: "validation_error" });
  }

  for (const [code, status] of [
    ["not_found", 404],
    ["unauthorized", 403],
    ["unexpected_error", 500],
  ]) {
    const response = await createListTenantAuditEventsRoute({
      listTenantAuditEvents: async () => {
        throw new TenantServiceError(code);
      },
    })(
      new Request(`http://localhost/api/tenants/${TENANT_ID}/audit`),
      context(),
    );
    assert.equal(response.status, status);
    assert.deepEqual(await body(response), { error: code });
  }
});

test("route factories execute services per request without shared data cache", async () => {
  let calls = 0;
  const GET = createListTenantsRoute({
    listTenants: async () => [{ ...tenant, revision: ++calls }],
  });

  const first = await body(await GET());
  const second = await body(await GET());
  assert.equal(first[0].revision, 1);
  assert.equal(second[0].revision, 2);
  assert.equal(calls, 2);
});
