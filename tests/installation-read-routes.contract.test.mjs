import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { redirect } from "next/navigation";

import {
  createGetInstallationRoute,
  createListInstallationAuditEventsRoute,
  createListInstallationsRoute,
} from "../lib/server/installations/installation-read-route.ts";
import { InstallationServiceError } from "../lib/server/installations/installation.errors.ts";
import {
  validateAuditListInput,
  validateListInstallationsInput,
} from "../lib/server/installations/installation.validation.ts";

const INSTALLATION_ID = "00000000-0000-4000-8000-000000000101";
const TENANT_ID = "00000000-0000-4000-8000-000000000201";
const EVENT_ID = "00000000-0000-4000-8000-000000000301";
const OCCURRED_AT = "2026-07-29T12:00:00.000Z";

const listPage = Object.freeze({
  hasMore: false,
  items: Object.freeze([
    Object.freeze({
      administrativeStatus: "active",
      applicationHost: "example.supabase.co",
      archivedAt: null,
      displayName: "Example Production",
      environment: "production",
      hostingRegion: "eu-north-1",
      id: INSTALLATION_ID,
      installationCode: "example-production",
      revision: 2,
      tenantId: TENANT_ID,
      tenantLegalName: "Example AB",
      updatedAt: OCCURRED_AT,
    }),
  ]),
  nextCursor: null,
});
const detail = Object.freeze({
  administrativeNote: "Restricted",
  administrativeStatus: "decommissioned",
  applicationUrl: "https://example.supabase.co/app",
  archivedAt: OCCURRED_AT,
  createdAt: OCCURRED_AT,
  displayName: "Example Production",
  environment: "production",
  hostingRegion: "eu-north-1",
  id: INSTALLATION_ID,
  installationCode: "example-production",
  revision: 3,
  supabaseProjectRef: "projectref123",
  tenantId: TENANT_ID,
  tenantLegalName: "Example AB",
  updatedAt: OCCURRED_AT,
});
const auditPage = Object.freeze({
  hasMore: false,
  items: Object.freeze([]),
  nextCursor: null,
});
const context = (installationId = INSTALLATION_ID) => ({
  params: Promise.resolve({ installationId }),
});

async function body(response) {
  return response.json();
}
function assertNoStore(response) {
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
}
function assertSafeError(payload, code) {
  assert.deepEqual(Object.keys(payload), ["error"]);
  assert.deepEqual(Object.keys(payload.error).sort(), ["code", "message"]);
  assert.equal(payload.error.code, code);
  assert.equal(typeof payload.error.message, "string");
  assert.equal(payload.error.message.length > 0, true);
}

test("route inventory contains exactly three dynamic GET-only installation routes", async () => {
  const paths = [
    "../app/api/installations/route.ts",
    "../app/api/installations/[installationId]/route.ts",
    "../app/api/installations/[installationId]/audit/route.ts",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /^import "server-only";/);
    assert.match(source, /dynamic = "force-dynamic"/);
    assert.match(source, /revalidate = 0/);
    assert.match(source, /export const GET/);
    assert.doesNotMatch(source, /export const (POST|PUT|PATCH|DELETE)/);
    assert.doesNotMatch(
      source,
      /supabase|repository|createBrowserClient|service[_ -]?role|\.rpc\(|\.from\(/i,
    );
  }
  const adapter = await readFile(
    new URL(
      "../lib/server/installations/installation-read-route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(adapter, /^import "server-only";/);
  assert.match(adapter, /unstable_rethrow/);
  assert.doesNotMatch(
    adapter,
    /supabase|repository|createBrowserClient|service[_ -]?role|unstable_cache/i,
  );
});

test("list route parses defaults and every locked query parameter exactly once", async () => {
  const inputs = [];
  const GET = createListInstallationsRoute({
    listInstallations: async (input) => {
      inputs.push(input);
      validateListInstallationsInput(input);
      return listPage;
    },
  });

  const defaultResponse = await GET(
    new Request("http://localhost/api/installations"),
  );
  assert.equal(defaultResponse.status, 200);
  assert.deepEqual(inputs.shift(), {
    administrativeStatus: undefined,
    cursor: undefined,
    environment: undefined,
    includeArchived: undefined,
    pageSize: undefined,
    search: undefined,
    tenantId: undefined,
  });
  assert.deepEqual(await body(defaultResponse), listPage);
  assertNoStore(defaultResponse);

  const query = new URLSearchParams({
    administrativeStatus: "active",
    cursorDisplayName: "Example Production",
    cursorId: INSTALLATION_ID,
    environment: "production",
    includeArchived: "true",
    pageSize: "100",
    search: "Example",
    tenantId: TENANT_ID,
  });
  const response = await GET(
    new Request(`http://localhost/api/installations?${query}`),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(inputs.shift(), {
    administrativeStatus: "active",
    cursor: {
      displayName: "Example Production",
      id: INSTALLATION_ID,
    },
    environment: "production",
    includeArchived: true,
    pageSize: 100,
    search: "Example",
    tenantId: TENANT_ID,
  });
  assert.deepEqual(Object.keys(await body(response)).sort(), [
    "hasMore",
    "items",
    "nextCursor",
  ]);
});

test("list parsing normalizes empty values and locks boolean, cursor and duplicate behavior", async () => {
  const inputs = [];
  const GET = createListInstallationsRoute({
    listInstallations: async (input) => {
      inputs.push(input);
      validateListInstallationsInput(input);
      return listPage;
    },
  });
  const emptyResponse = await GET(
    new Request(
      "http://localhost/api/installations?pageSize=&tenantId=&environment=&administrativeStatus=&includeArchived=&search=&cursorDisplayName=&cursorId=",
    ),
  );
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(inputs.shift(), {
    administrativeStatus: undefined,
    cursor: undefined,
    environment: undefined,
    includeArchived: undefined,
    pageSize: undefined,
    search: undefined,
    tenantId: undefined,
  });

  const falseResponse = await GET(
    new Request("http://localhost/api/installations?includeArchived=false"),
  );
  assert.equal(falseResponse.status, 200);
  assert.equal(inputs.shift().includeArchived, false);

  for (const query of [
    "?includeArchived=1",
    `?cursorId=${INSTALLATION_ID}`,
    "?cursorDisplayName=Example",
    "?pageSize=1.5",
    "?pageSize=50&pageSize=25",
    "?search=a&search=b",
    "?sort=displayName",
  ]) {
    const response = await GET(
      new Request(`http://localhost/api/installations${query}`),
    );
    assert.equal(response.status, 422);
    assertSafeError(await body(response), "validation_error");
    assertNoStore(response);
  }
});

test("list response is the exact service page and excludes detail-only metadata", async () => {
  let calls = 0;
  const response = await createListInstallationsRoute({
    listInstallations: async () => {
      calls += 1;
      return listPage;
    },
  })(new Request("http://localhost/api/installations"));
  const payload = await body(response);
  assert.deepEqual(payload, listPage);
  assert.equal(calls, 1);
  assert.equal("applicationUrl" in payload.items[0], false);
  assert.equal("supabaseProjectRef" in payload.items[0], false);
  assert.equal("administrativeNote" in payload.items[0], false);
});

test("detail forwards one ID, permits archived DTO and maps not-found and validation errors", async () => {
  let calls = 0;
  let receivedId;
  const GET = createGetInstallationRoute({
    getInstallationById: async (id) => {
      calls += 1;
      receivedId = id;
      return detail;
    },
  });
  const response = await GET(
    new Request(`http://localhost/api/installations/${INSTALLATION_ID}`),
    context(),
  );
  assert.equal(calls, 1);
  assert.equal(receivedId, INSTALLATION_ID);
  assert.deepEqual(await body(response), detail);
  assertNoStore(response);
  assert.equal("createdBy" in detail, false);

  for (const [id, code, status] of [
    [INSTALLATION_ID, "not_found", 404],
    ["invalid", "validation_error", 422],
  ]) {
    const failed = await createGetInstallationRoute({
      getInstallationById: async () => {
        throw new InstallationServiceError(code);
      },
    })(new Request(`http://localhost/api/installations/${id}`), context(id));
    assert.equal(failed.status, status);
    assertSafeError(await body(failed), code);
  }
});

test("audit route supports defaults, page size, complete cursor and installation scope", async () => {
  const inputs = [];
  const GET = createListInstallationAuditEventsRoute({
    listInstallationAuditEvents: async (input) => {
      inputs.push(input);
      validateAuditListInput(input);
      return auditPage;
    },
  });
  const defaultResponse = await GET(
    new Request(`http://localhost/api/installations/${INSTALLATION_ID}/audit`),
    context(),
  );
  assert.deepEqual(inputs.shift(), {
    cursor: undefined,
    installationId: INSTALLATION_ID,
    pageSize: undefined,
  });
  assert.deepEqual(await body(defaultResponse), auditPage);
  assertNoStore(defaultResponse);

  const query = new URLSearchParams({
    cursorId: EVENT_ID,
    cursorOccurredAt: OCCURRED_AT,
    pageSize: "25",
  });
  const response = await GET(
    new Request(
      `http://localhost/api/installations/${INSTALLATION_ID}/audit?${query}`,
    ),
    context(),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(inputs.shift(), {
    cursor: { id: EVENT_ID, occurredAt: OCCURRED_AT },
    installationId: INSTALLATION_ID,
    pageSize: 25,
  });
});

test("audit rejects partial, duplicate, malformed and unsupported query input", async () => {
  const GET = createListInstallationAuditEventsRoute({
    listInstallationAuditEvents: async (input) => {
      validateAuditListInput(input);
      return auditPage;
    },
  });
  for (const query of [
    `?cursorId=${EVENT_ID}`,
    `?cursorOccurredAt=${encodeURIComponent(OCCURRED_AT)}`,
    "?pageSize=invalid",
    "?pageSize=25&pageSize=50",
    "?search=anything",
  ]) {
    const response = await GET(
      new Request(
        `http://localhost/api/installations/${INSTALLATION_ID}/audit${query}`,
      ),
      context(),
    );
    assert.equal(response.status, 422);
    assertSafeError(await body(response), "validation_error");
  }
});

test("all service errors map stably, raw errors are masked and framework redirects survive", async () => {
  for (const [code, status] of [
    ["unauthorized", 403],
    ["not_found", 404],
    ["conflict", 409],
    ["invalid_state_transition", 409],
    ["tenant_not_available", 409],
    ["duplicate_installation", 409],
    ["validation_error", 422],
    ["audit_failure", 500],
    ["unexpected_error", 500],
  ]) {
    const response = await createListInstallationsRoute({
      listInstallations: async () => {
        throw new InstallationServiceError(code);
      },
    })(new Request("http://localhost/api/installations"));
    assert.equal(response.status, status);
    assertSafeError(await body(response), code);
    assertNoStore(response);
  }

  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await createListInstallationsRoute({
      listInstallations: async () => {
        throw new Error(`raw SQL ${TENANT_ID}`);
      },
    })(new Request("http://localhost/api/installations"));
    const payload = await body(response);
    assert.equal(response.status, 500);
    assertSafeError(payload, "unexpected_error");
    assert.equal(JSON.stringify(payload).includes(TENANT_ID), false);
  } finally {
    console.error = originalError;
  }

  await assert.rejects(
    createListInstallationsRoute({
      listInstallations: async () => redirect("/auth/owner-check"),
    })(new Request("http://localhost/api/installations")),
    (error) => error?.digest?.startsWith("NEXT_REDIRECT") === true,
  );
});

test("route factories execute services once per request without cross-request cache", async () => {
  let calls = 0;
  const GET = createListInstallationsRoute({
    listInstallations: async () => ({
      ...listPage,
      items: [{ ...listPage.items[0], revision: ++calls }],
    }),
  });
  const first = await body(
    await GET(new Request("http://localhost/api/installations")),
  );
  const second = await body(
    await GET(new Request("http://localhost/api/installations")),
  );
  assert.equal(first.items[0].revision, 1);
  assert.equal(second.items[0].revision, 2);
  assert.equal(calls, 2);
});
