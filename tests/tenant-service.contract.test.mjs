import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mapTenantAuditPage,
  mapTenantRow,
} from "../lib/server/tenants/tenant.mapper.ts";
import {
  mapTenantDatabaseError,
  TenantServiceError,
} from "../lib/server/tenants/tenant.errors.ts";
import { createTenantRepository } from "../lib/server/tenants/tenant.repository.ts";
import { createTenantService } from "../lib/server/tenants/tenant.service-core.ts";
import {
  validateAuditListInput,
  validateCreateTenantInput,
  validateStateMutationInput,
  validateUpdateTenantInput,
} from "../lib/server/tenants/tenant.validation.ts";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_TENANT_ID = "00000000-0000-4000-8000-000000000102";
const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000201";
const CORRELATION_ID = "00000000-0000-4000-8000-000000000301";
const OCCURRED_AT = "2026-07-27T12:00:00.000Z";

const tenantRow = Object.freeze({
  administrative_note: null,
  archived_at: null,
  archived_by: null,
  category: "customer",
  contact_email: null,
  contact_name: "Ada",
  contact_phone: null,
  country_code: "SE",
  created_at: OCCURRED_AT,
  created_by: OWNER_ID,
  id: TENANT_ID,
  legal_name: "Exempel AB",
  operational_status: "active",
  organization_number: "556016-0680",
  revision: 1,
  updated_at: OCCURRED_AT,
  updated_by: OWNER_ID,
});

const auditRow = Object.freeze({
  actor_user_id: OWNER_ID,
  changed_fields: ["category", "legal_name"],
  correlation_id: null,
  event_type: "tenant_created",
  has_more: false,
  id: EVENT_ID,
  next_cursor_id: null,
  next_cursor_occurred_at: null,
  occurred_at: OCCURRED_AT,
  revision_after: 1,
  revision_before: null,
  tenant_id: TENANT_ID,
});

const createInput = Object.freeze({
  category: "customer",
  correlationId: CORRELATION_ID,
  legalName: "Exempel AB",
  organizationNumber: "556016-0680",
});

const updateInput = Object.freeze({
  administrativeNote: null,
  contactEmail: null,
  contactName: "Ada",
  contactPhone: null,
  correlationId: CORRELATION_ID,
  expectedRevision: 1,
  legalName: "Exempel AB",
  organizationNumber: "556016-0680",
  tenantId: TENANT_ID,
});

const stateInput = Object.freeze({
  correlationId: CORRELATION_ID,
  expectedRevision: 1,
  tenantId: TENANT_ID,
});

function expectServiceCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error instanceof TenantServiceError, true);
    assert.equal(error.code, code);
    return true;
  });
}

test("tenant server boundary is explicit and contains no browser or service-role client", async () => {
  const files = [
    "tenant.types.ts",
    "tenant.validation.ts",
    "tenant.mapper.ts",
    "tenant.errors.ts",
    "tenant.repository.ts",
    "tenant.service-core.ts",
    "tenant.service.ts",
  ];

  for (const file of files) {
    const source = await readFile(
      new URL(`../lib/server/tenants/${file}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /^import "server-only";/);
    assert.doesNotMatch(source, /createBrowserClient|service[_ -]?role/i);
  }
});

test("tenant rows map centrally to immutable camel-case models with nullable fields", () => {
  assert.deepEqual(mapTenantRow(tenantRow), {
    administrativeNote: null,
    archivedAt: null,
    archivedBy: null,
    category: "customer",
    contactEmail: null,
    contactName: "Ada",
    contactPhone: null,
    countryCode: "SE",
    createdAt: OCCURRED_AT,
    createdBy: OWNER_ID,
    id: TENANT_ID,
    legalName: "Exempel AB",
    operationalStatus: "active",
    organizationNumber: "556016-0680",
    revision: 1,
    updatedAt: OCCURRED_AT,
    updatedBy: OWNER_ID,
  });

  const archived = mapTenantRow({
    ...tenantRow,
    archived_at: OCCURRED_AT,
    archived_by: OWNER_ID,
  });
  assert.equal(archived.archivedAt, OCCURRED_AT);
  expectServiceCode(
    () => mapTenantRow({ ...tenantRow, revision: 0 }),
    "unexpected_error",
  );
  expectServiceCode(
    () => mapTenantRow({ ...tenantRow, archived_at: OCCURRED_AT }),
    "unexpected_error",
  );
});

test("strict input validation covers UUID, revisions, create, update, page size and cursor", () => {
  assert.equal(validateCreateTenantInput(createInput), createInput);
  assert.equal(validateUpdateTenantInput(updateInput), updateInput);
  assert.equal(validateStateMutationInput(stateInput), stateInput);
  assert.deepEqual(
    validateAuditListInput({
      cursor: { id: EVENT_ID, occurredAt: OCCURRED_AT },
      pageSize: 100,
      tenantId: TENANT_ID,
    }).cursor,
    { id: EVENT_ID, occurredAt: OCCURRED_AT },
  );

  expectServiceCode(
    () => validateCreateTenantInput({ ...createInput, category: "other" }),
    "validation_error",
  );
  expectServiceCode(
    () => validateUpdateTenantInput({ ...updateInput, expectedRevision: 0 }),
    "validation_error",
  );
  expectServiceCode(
    () => validateStateMutationInput({ ...stateInput, tenantId: "bad" }),
    "validation_error",
  );
  for (const pageSize of [0, 101, 1.5]) {
    expectServiceCode(
      () => validateAuditListInput({ pageSize, tenantId: TENANT_ID }),
      "validation_error",
    );
  }
  expectServiceCode(
    () =>
      validateAuditListInput({
        cursor: { id: EVENT_ID, occurredAt: "invalid" },
        tenantId: TENANT_ID,
      }),
    "validation_error",
  );
});

test("stable database messages map exactly and unknown errors are sanitized", () => {
  for (const code of [
    "unauthorized",
    "not_found",
    "conflict",
    "invalid_state_transition",
    "validation_error",
    "audit_failure",
  ]) {
    assert.equal(mapTenantDatabaseError({ message: code }).code, code);
  }

  const mapped = mapTenantDatabaseError({
    details: OWNER_ID,
    message: "sensitive SQL error",
  });
  assert.equal(mapped.code, "unexpected_error");
  assert.equal(mapped.message.includes("sensitive"), false);
  assert.equal(JSON.stringify(mapped).includes(OWNER_ID), false);
});

test("audit output maps page metadata and rejects malformed or cross-tenant rows", () => {
  assert.deepEqual(mapTenantAuditPage([auditRow], TENANT_ID), {
    hasMore: false,
    items: [
      {
        actorUserId: OWNER_ID,
        changedFields: ["category", "legal_name"],
        correlationId: null,
        eventType: "tenant_created",
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        revisionAfter: 1,
        revisionBefore: null,
        tenantId: TENANT_ID,
      },
    ],
    nextCursor: null,
  });

  const page = mapTenantAuditPage(
    [
      {
        ...auditRow,
        correlation_id: CORRELATION_ID,
        has_more: true,
        next_cursor_id: EVENT_ID,
        next_cursor_occurred_at: OCCURRED_AT,
        revision_before: 1,
        revision_after: 2,
      },
    ],
    TENANT_ID,
  );
  assert.deepEqual(page.nextCursor, { id: EVENT_ID, occurredAt: OCCURRED_AT });
  assert.equal(page.items[0].revisionBefore, 1);
  assert.equal(page.items[0].correlationId, CORRELATION_ID);

  for (const malformed of [
    [{ ...auditRow, tenant_id: OTHER_TENANT_ID }],
    [{ ...auditRow, event_type: "unknown" }],
    [{ ...auditRow, next_cursor_id: EVENT_ID }],
    [{ ...auditRow, changed_fields: ["legal_name", "category"] }],
  ]) {
    expectServiceCode(
      () => mapTenantAuditPage(malformed, TENANT_ID),
      "unexpected_error",
    );
  }
});

test("repository uses locked reads and exact RPC argument mappings", async () => {
  const calls = [];
  const result = { data: tenantRow, error: null };
  const query = {
    eq(field, value) {
      calls.push(["eq", field, value]);
      return this;
    },
    is(field, value) {
      calls.push(["is", field, value]);
      return this;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve(result);
    },
    order(field, options) {
      calls.push(["order", field, options]);
      return this;
    },
    select(value) {
      calls.push(["select", value]);
      return this;
    },
    then(resolve) {
      return Promise.resolve(result).then(resolve);
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
  const repository = createTenantRepository(client);

  await repository.listTenants();
  assert.deepEqual(calls.splice(0), [
    ["from", "tenants"],
    ["select", "*"],
    ["is", "archived_at", null],
    ["order", "legal_name", { ascending: true }],
    ["order", "id", { ascending: true }],
  ]);
  await repository.getTenantById(TENANT_ID);
  assert.deepEqual(calls.splice(0), [
    ["from", "tenants"],
    ["select", "*"],
    ["eq", "id", TENANT_ID],
    ["maybeSingle"],
  ]);

  const operations = [
    ["createTenant", "create_tenant", createInput],
    ["updateTenant", "update_tenant", updateInput],
    ["pauseTenant", "pause_tenant", stateInput],
    ["activateTenant", "activate_tenant", stateInput],
    ["archiveTenant", "archive_tenant", stateInput],
    ["restoreTenant", "restore_tenant", stateInput],
  ];
  for (const [method, rpc, input] of operations) {
    await repository[method](input);
    const call = calls.shift();
    assert.equal(call[0], "rpc");
    assert.equal(call[1], rpc);
    assert.equal(call[2].p_tenant_id ?? TENANT_ID, TENANT_ID);
    assert.equal(call[2].p_correlation_id, CORRELATION_ID);
    if (method !== "createTenant") {
      assert.equal(call[2].p_expected_revision, 1);
    }
  }
  await repository.listTenantAuditEvents({
    cursor: { id: EVENT_ID, occurredAt: OCCURRED_AT },
    pageSize: 25,
    tenantId: TENANT_ID,
  });
  assert.deepEqual(calls.shift(), [
    "rpc",
    "list_tenant_audit_events",
    {
      p_cursor_id: EVENT_ID,
      p_cursor_occurred_at: OCCURRED_AT,
      p_page_size: 25,
      p_tenant_id: TENANT_ID,
    },
  ]);
});

test("all nine service operations guard before validation and repository access", async () => {
  const called = [];
  const repository = Object.fromEntries(
    [
      "activateTenant",
      "archiveTenant",
      "createTenant",
      "getTenantById",
      "pauseTenant",
      "restoreTenant",
      "updateTenant",
    ].map((method) => [
      method,
      async (input) => {
        called.push(method, input);
        return { data: tenantRow, error: null };
      },
    ]),
  );
  repository.listTenants = async () => ({ data: [tenantRow], error: null });
  repository.listTenantAuditEvents = async () => ({
    data: [auditRow],
    error: null,
  });

  let guardCalls = 0;
  let repositoryCalls = 0;
  const service = createTenantService({
    getRepository: async () => {
      repositoryCalls += 1;
      return repository;
    },
    requireOwner: async () => {
      guardCalls += 1;
    },
  });

  const operations = [
    () => service.listTenants(),
    () => service.getTenantById(TENANT_ID),
    () => service.listTenantAuditEvents({ tenantId: TENANT_ID }),
    () => service.createTenant(createInput),
    () => service.updateTenant(updateInput),
    () => service.pauseTenant(stateInput),
    () => service.activateTenant(stateInput),
    () => service.archiveTenant(stateInput),
    () => service.restoreTenant(stateInput),
  ];
  for (const operation of operations) {
    await operation();
  }
  assert.equal(guardCalls, 9);
  assert.equal(repositoryCalls, 9);

  const guardFailure = new TenantServiceError("unauthorized");
  let accessedAfterFailure = false;
  const denied = createTenantService({
    getRepository: async () => {
      accessedAfterFailure = true;
      return repository;
    },
    requireOwner: async () => {
      throw guardFailure;
    },
  });
  await assert.rejects(denied.listTenants(), guardFailure);
  await assert.rejects(denied.getTenantById("invalid"), guardFailure);
  assert.equal(accessedAfterFailure, false);
});

test("service maps list, archived detail, not-found and malformed responses", async () => {
  const repository = {
    async getTenantById() {
      return {
        data: { ...tenantRow, archived_at: OCCURRED_AT, archived_by: OWNER_ID },
        error: null,
      };
    },
    async listTenants() {
      return { data: [tenantRow], error: null };
    },
  };
  const service = createTenantService({
    getRepository: async () => repository,
    requireOwner: async () => {},
  });
  assert.equal((await service.listTenants())[0].legalName, "Exempel AB");
  assert.equal(
    (await service.getTenantById(TENANT_ID)).archivedAt,
    OCCURRED_AT,
  );

  repository.getTenantById = async () => ({ data: null, error: null });
  await assert.rejects(
    service.getTenantById(TENANT_ID),
    (error) => error.code === "not_found",
  );
  repository.listTenants = async () => ({ data: {}, error: null });
  await assert.rejects(
    service.listTenants(),
    (error) => error.code === "unexpected_error",
  );
});
