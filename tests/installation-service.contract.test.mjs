import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mapInstallationAuditPage,
  mapInstallationDetailRow,
  mapInstallationListPage,
  mapInstallationRow,
} from "../lib/server/installations/installation.mapper.ts";
import {
  InstallationServiceError,
  mapInstallationDatabaseError,
} from "../lib/server/installations/installation.errors.ts";
import { createInstallationRepository } from "../lib/server/installations/installation.repository.ts";
import { createInstallationService } from "../lib/server/installations/installation.service-core.ts";
import {
  validateAuditListInput,
  validateCreateInstallationInput,
  validateLifecycleInput,
  validateListInstallationsInput,
  validateUpdateInstallationInput,
} from "../lib/server/installations/installation.validation.ts";

const INSTALLATION_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_INSTALLATION_ID = "00000000-0000-4000-8000-000000000102";
const TENANT_ID = "00000000-0000-4000-8000-000000000201";
const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000301";
const CORRELATION_ID = "00000000-0000-4000-8000-000000000401";
const OCCURRED_AT = "2026-07-29T12:00:00.000Z";

const installationRow = Object.freeze({
  administrative_note: "Restricted",
  administrative_status: "planned",
  application_url: "https://example.supabase.co/app",
  archived_at: null,
  archived_by: null,
  created_at: OCCURRED_AT,
  created_by: OWNER_ID,
  display_name: "Example Production",
  environment: "production",
  hosting_region: "eu-north-1",
  id: INSTALLATION_ID,
  installation_code: "example-production",
  revision: 1,
  supabase_project_ref: "projectref123",
  tenant_id: TENANT_ID,
  updated_at: OCCURRED_AT,
  updated_by: OWNER_ID,
});
const listRow = Object.freeze({
  administrative_status: "planned",
  application_host: "example.supabase.co",
  archived_at: null,
  display_name: "Example Production",
  environment: "production",
  has_more: false,
  hosting_region: "eu-north-1",
  id: INSTALLATION_ID,
  installation_code: "example-production",
  next_cursor_display_name: null,
  next_cursor_id: null,
  revision: 1,
  tenant_id: TENANT_ID,
  tenant_legal_name: "Example AB",
  updated_at: OCCURRED_AT,
});
const auditRow = Object.freeze({
  actor_user_id: OWNER_ID,
  changed_fields: ["id", "tenant_id", "revision"],
  correlation_id: null,
  event_type: "installation_created",
  has_more: false,
  id: EVENT_ID,
  installation_id: INSTALLATION_ID,
  next_cursor_id: null,
  next_cursor_occurred_at: null,
  occurred_at: OCCURRED_AT,
  revision_after: 1,
  revision_before: null,
});
const createInput = Object.freeze({
  administrativeNote: "",
  applicationUrl: "https://example.supabase.co/app",
  correlationId: CORRELATION_ID,
  displayName: "Example Production",
  environment: "production",
  hostingRegion: "eu-north-1",
  installationCode: "example-production",
  supabaseProjectRef: "projectref123",
  tenantId: TENANT_ID,
});
const updateInput = Object.freeze({
  administrativeNote: null,
  applicationUrl: "https://example.supabase.co/app",
  correlationId: CORRELATION_ID,
  displayName: "Example Production",
  expectedRevision: 1,
  hostingRegion: "eu-north-1",
  installationId: INSTALLATION_ID,
  supabaseProjectRef: "projectref123",
});
const lifecycleInput = Object.freeze({
  correlationId: CORRELATION_ID,
  expectedRevision: 1,
  installationId: INSTALLATION_ID,
});

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error instanceof InstallationServiceError, true);
    assert.equal(error.code, code);
    return true;
  });
}

test("installation production boundary is server-only and exposes no browser, service-role or repository API", async () => {
  const files = [
    "installation.types.ts",
    "installation.validation.ts",
    "installation.mapper.ts",
    "installation.errors.ts",
    "installation.repository.ts",
    "installation.service-core.ts",
    "installation.service.ts",
    "index.ts",
  ];
  for (const file of files) {
    const source = await readFile(
      new URL(`../lib/server/installations/${file}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /^import "server-only";/);
    assert.doesNotMatch(source, /createBrowserClient|service[_ -]?role/i);
  }
  const index = await readFile(
    new URL("../lib/server/installations/index.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(index, /installation\.repository/);
});

test("list and detail mapping are separate, immutable, nullable and fail closed", () => {
  const page = mapInstallationListPage([listRow]);
  assert.deepEqual(page, {
    hasMore: false,
    items: [
      {
        administrativeStatus: "planned",
        applicationHost: "example.supabase.co",
        archivedAt: null,
        displayName: "Example Production",
        environment: "production",
        hostingRegion: "eu-north-1",
        id: INSTALLATION_ID,
        installationCode: "example-production",
        revision: 1,
        tenantId: TENANT_ID,
        tenantLegalName: "Example AB",
        updatedAt: OCCURRED_AT,
      },
    ],
    nextCursor: null,
  });
  assert.equal("applicationUrl" in page.items[0], false);
  assert.equal("supabaseProjectRef" in page.items[0], false);
  assert.equal("administrativeNote" in page.items[0], false);
  assert.equal(Object.isFrozen(page.items[0]), true);

  const detail = mapInstallationDetailRow({
    ...installationRow,
    archived_at: OCCURRED_AT,
    tenants: { legal_name: "Example AB" },
  });
  assert.equal(detail.tenantLegalName, "Example AB");
  assert.equal(detail.supabaseProjectRef, "projectref123");
  assert.equal(detail.administrativeNote, "Restricted");
  assert.equal(detail.archivedAt, OCCURRED_AT);
  assert.equal("createdBy" in detail, false);
  expectCode(
    () =>
      mapInstallationListPage([
        { ...listRow, application_host: "https://bad" },
      ]),
    "unexpected_error",
  );
  expectCode(
    () =>
      mapInstallationDetailRow({
        ...installationRow,
        tenants: { legal_name: "" },
      }),
    "unexpected_error",
  );
});

test("input validation locks defaults, filters, search, canonical values and nullable normalization", () => {
  assert.deepEqual(validateListInstallationsInput({}), {
    includeArchived: false,
    pageSize: 50,
    search: null,
  });
  assert.deepEqual(
    validateListInstallationsInput({
      administrativeStatus: "active",
      cursor: { displayName: "Example Production", id: INSTALLATION_ID },
      environment: "production",
      includeArchived: true,
      pageSize: 100,
      search: " example ",
      tenantId: TENANT_ID,
    }),
    {
      administrativeStatus: "active",
      cursor: { displayName: "Example Production", id: INSTALLATION_ID },
      environment: "production",
      includeArchived: true,
      pageSize: 100,
      search: "example",
      tenantId: TENANT_ID,
    },
  );
  assert.equal(
    validateCreateInstallationInput(createInput).administrativeNote,
    null,
  );
  assert.deepEqual(validateUpdateInstallationInput(updateInput), updateInput);
  assert.equal(validateLifecycleInput(lifecycleInput).expectedRevision, 1);
  assert.equal(
    validateAuditListInput({ installationId: INSTALLATION_ID }).pageSize,
    25,
  );
  for (const input of [
    { pageSize: 0 },
    { pageSize: 101 },
    { environment: "pilot" },
    { administrativeStatus: "deleted" },
    { cursor: { id: INSTALLATION_ID } },
    { search: "x".repeat(121) },
  ])
    expectCode(() => validateListInstallationsInput(input), "validation_error");
  expectCode(
    () =>
      validateCreateInstallationInput({
        ...createInput,
        applicationUrl: "http://example.com",
      }),
    "validation_error",
  );
  expectCode(
    () =>
      validateAuditListInput({
        cursor: { id: EVENT_ID },
        installationId: INSTALLATION_ID,
      }),
    "validation_error",
  );
});

test("list and audit pages validate cursor metadata, order and installation scope", () => {
  const listPage = mapInstallationListPage([
    {
      ...listRow,
      has_more: true,
      next_cursor_display_name: listRow.display_name,
      next_cursor_id: INSTALLATION_ID,
    },
  ]);
  assert.deepEqual(listPage.nextCursor, {
    displayName: "Example Production",
    id: INSTALLATION_ID,
  });
  assert.deepEqual(mapInstallationAuditPage([auditRow], INSTALLATION_ID), {
    hasMore: false,
    items: [
      {
        actorUserId: OWNER_ID,
        changedFields: ["id", "tenant_id", "revision"],
        correlationId: null,
        eventType: "installation_created",
        id: EVENT_ID,
        installationId: INSTALLATION_ID,
        occurredAt: OCCURRED_AT,
        revisionAfter: 1,
        revisionBefore: null,
      },
    ],
    nextCursor: null,
  });
  for (const malformed of [
    [{ ...auditRow, installation_id: OTHER_INSTALLATION_ID }],
    [{ ...auditRow, event_type: "unknown" }],
    [{ ...auditRow, changed_fields: ["revision", "id"] }],
    [{ ...auditRow, revision_before: 1, revision_after: 3 }],
    [{ ...auditRow, next_cursor_id: EVENT_ID }],
  ])
    expectCode(
      () => mapInstallationAuditPage(malformed, INSTALLATION_ID),
      "unexpected_error",
    );
});

test("repository performs one exact read or RPC per operation without direct writes", async () => {
  const calls = [];
  const result = { data: installationRow, error: null };
  const query = {
    eq(field, value) {
      calls.push(["eq", field, value]);
      return this;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve(result);
    },
    select(value) {
      calls.push(["select", value]);
      return this;
    },
  };
  const client = {
    from(table) {
      calls.push(["from", table]);
      return query;
    },
    rpc(name, args) {
      calls.push(["rpc", name, args]);
      return Promise.resolve(result);
    },
  };
  const repository = createInstallationRepository(client);
  await repository.getInstallationById(INSTALLATION_ID);
  assert.equal(calls[0][1], "installations");
  assert.equal(calls.at(-1)[0], "maybeSingle");
  calls.splice(0);
  await repository.listInstallations(validateListInstallationsInput({}));
  assert.deepEqual(calls.shift(), [
    "rpc",
    "list_installations",
    {
      p_administrative_status: undefined,
      p_cursor_display_name: undefined,
      p_cursor_id: undefined,
      p_environment: undefined,
      p_include_archived: false,
      p_page_size: 50,
      p_search: undefined,
      p_tenant_id: undefined,
    },
  ]);
  await repository.listInstallationAuditEvents({
    cursor: { id: EVENT_ID, occurredAt: OCCURRED_AT },
    installationId: INSTALLATION_ID,
    pageSize: 25,
  });
  assert.equal(calls.shift()[1], "list_installation_audit_events");
  const operations = [
    [
      "createInstallation",
      "create_installation",
      validateCreateInstallationInput(createInput),
    ],
    ["updateInstallation", "update_installation", updateInput],
    ["activateInstallation", "activate_installation", lifecycleInput],
    ["pauseInstallation", "pause_installation", lifecycleInput],
    ["decommissionInstallation", "decommission_installation", lifecycleInput],
    ["archiveInstallation", "archive_installation", lifecycleInput],
    ["restoreInstallation", "restore_installation", lifecycleInput],
  ];
  for (const [method, rpc, input] of operations) {
    await repository[method](input);
    const call = calls.shift();
    assert.equal(call[1], rpc);
    assert.equal(call[2].p_installation_id ?? INSTALLATION_ID, INSTALLATION_ID);
  }
  const source = await readFile(
    new URL(
      "../lib/server/installations/installation.repository.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
});

test("all ten service operations guard exactly once before validation and one repository access", async () => {
  const methods = [
    "activateInstallation",
    "archiveInstallation",
    "createInstallation",
    "decommissionInstallation",
    "pauseInstallation",
    "restoreInstallation",
    "updateInstallation",
  ];
  const repository = Object.fromEntries(
    methods.map((method) => [
      method,
      async () => ({ data: installationRow, error: null }),
    ]),
  );
  repository.listInstallations = async () => ({ data: [listRow], error: null });
  repository.getInstallationById = async () => ({
    data: { ...installationRow, tenants: { legal_name: "Example AB" } },
    error: null,
  });
  repository.listInstallationAuditEvents = async () => ({
    data: [auditRow],
    error: null,
  });
  let guards = 0;
  let repositories = 0;
  const service = createInstallationService({
    getRepository: async () => {
      repositories += 1;
      return repository;
    },
    requireOwner: async () => {
      guards += 1;
    },
  });
  const operations = [
    () => service.listInstallations(),
    () => service.getInstallationById(INSTALLATION_ID),
    () =>
      service.listInstallationAuditEvents({
        installationId: INSTALLATION_ID,
      }),
    () => service.createInstallation(createInput),
    () => service.updateInstallation(updateInput),
    () => service.activateInstallation(lifecycleInput),
    () => service.pauseInstallation(lifecycleInput),
    () => service.decommissionInstallation(lifecycleInput),
    () => service.archiveInstallation(lifecycleInput),
    () => service.restoreInstallation(lifecycleInput),
  ];
  for (const operation of operations) await operation();
  assert.equal(guards, 10);
  assert.equal(repositories, 10);

  let accessed = false;
  const redirect = new Error("NEXT_REDIRECT");
  const denied = createInstallationService({
    getRepository: async () => {
      accessed = true;
      return repository;
    },
    requireOwner: async () => {
      throw redirect;
    },
  });
  await assert.rejects(denied.getInstallationById("bad"), redirect);
  assert.equal(accessed, false);
});

test("service maps not-found, malformed output and every stable database error without retry", async () => {
  for (const code of [
    "unauthorized",
    "not_found",
    "conflict",
    "validation_error",
    "invalid_state_transition",
    "tenant_not_available",
    "duplicate_installation",
    "audit_failure",
  ])
    assert.equal(mapInstallationDatabaseError({ message: code }).code, code);
  const unknown = mapInstallationDatabaseError({
    details: "projectref123",
    message: "raw SQL",
  });
  assert.equal(unknown.code, "unexpected_error");
  assert.equal(JSON.stringify(unknown).includes("projectref123"), false);

  let calls = 0;
  const repository = {
    async getInstallationById() {
      calls += 1;
      return { data: null, error: null };
    },
    async updateInstallation() {
      calls += 1;
      return { data: null, error: { message: "conflict" } };
    },
  };
  const service = createInstallationService({
    getRepository: async () => repository,
    requireOwner: async () => {},
  });
  await assert.rejects(
    service.getInstallationById(INSTALLATION_ID),
    (error) => error.code === "not_found",
  );
  await assert.rejects(
    service.updateInstallation(updateInput),
    (error) => error.code === "conflict",
  );
  assert.equal(calls, 2);
  expectCode(
    () => mapInstallationRow({ ...installationRow, revision: 0 }),
    "unexpected_error",
  );
});
