import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTenantActionCore } from "../lib/server/tenants/tenant-action-core.ts";
import { TenantServiceError } from "../lib/server/tenants/tenant.errors.ts";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const CORRELATION_ID = "00000000-0000-4000-8000-000000000301";

const tenant = Object.freeze({
  administrativeNote: null,
  archivedAt: null,
  archivedBy: null,
  category: "customer",
  contactEmail: null,
  contactName: null,
  contactPhone: null,
  countryCode: "SE",
  createdAt: "2026-07-27T12:00:00.000Z",
  createdBy: "00000000-0000-4000-8000-000000000001",
  id: TENANT_ID,
  legalName: "Exempel AB",
  operationalStatus: "active",
  organizationNumber: "556016-0680",
  revision: 2,
  updatedAt: "2026-07-27T12:00:00.000Z",
  updatedBy: "00000000-0000-4000-8000-000000000001",
});

function createForm(overrides = {}) {
  return formData({
    administrativeNote: "",
    category: "customer",
    contactEmail: "",
    contactName: "",
    contactPhone: "",
    legalName: " Exempel AB ",
    organizationNumber: " 556016-0680 ",
    ...overrides,
  });
}

function updateForm(overrides = {}) {
  return formData({
    administrativeNote: "",
    contactEmail: "",
    contactName: " Ada ",
    contactPhone: "",
    expectedRevision: "1",
    legalName: " Exempel AB ",
    organizationNumber: " 556016-0680 ",
    tenantId: TENANT_ID,
    ...overrides,
  });
}

function stateForm(overrides = {}) {
  return formData({
    expectedRevision: "1",
    tenantId: TENANT_ID,
    ...overrides,
  });
}

function formData(values) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) {
    result.set(key, value);
  }
  return result;
}

function setup(overrides = {}) {
  const calls = [];
  let correlationCalls = 0;
  const operation = (name) => async (input) => {
    calls.push([name, input]);
    return tenant;
  };
  const services = {
    activateTenant: operation("activateTenant"),
    archiveTenant: operation("archiveTenant"),
    createTenant: operation("createTenant"),
    pauseTenant: operation("pauseTenant"),
    restoreTenant: operation("restoreTenant"),
    updateTenant: operation("updateTenant"),
    ...overrides,
  };
  const core = createTenantActionCore({
    createCorrelationId() {
      correlationCalls += 1;
      return CORRELATION_ID;
    },
    rethrowControlFlow() {},
    services,
  });

  return {
    calls,
    core,
    correlationCalls: () => correlationCalls,
  };
}

test("action boundary is use-server, service-only and creates no mutation endpoint", async () => {
  const source = await readFile(
    new URL("../app/tenants/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /^"use server";/);
  assert.match(source, /import "server-only";/);
  assert.match(source, /@\/lib\/server\/tenants/);
  assert.doesNotMatch(
    source,
    /supabase|tenant\.repository|createBrowserClient|service_role|\.from\(|\.rpc\(/,
  );

  const apiFiles = [
    "../app/api/tenants/route.ts",
    "../app/api/tenants/[tenantId]/route.ts",
    "../app/api/tenants/[tenantId]/audit/route.ts",
  ];
  for (const path of apiFiles) {
    const route = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(route, /\b(?:POST|PATCH|PUT|DELETE)\b/);
  }
});

test("create normalizes allowed fields, ignores system fields and generates correlation server-side", async () => {
  const { calls, core, correlationCalls } = setup();
  const input = createForm({
    archivedAt: "client-controlled",
    correlationId: "client-controlled",
    id: "client-controlled",
    revision: "999",
    status: "paused",
  });

  assert.deepEqual(await core.createTenant(input), {
    ok: true,
    revision: 2,
    tenantId: TENANT_ID,
  });
  assert.deepEqual(calls, [
    [
      "createTenant",
      {
        administrativeNote: null,
        category: "customer",
        contactEmail: null,
        contactName: null,
        contactPhone: null,
        correlationId: CORRELATION_ID,
        legalName: "Exempel AB",
        organizationNumber: "556016-0680",
      },
    ],
  ]);
  assert.equal(correlationCalls(), 1);
});

test("create supports internal without organization number and rejects invalid category requirements", async () => {
  const { calls, core } = setup();
  const result = await core.createTenant(
    createForm({ category: "internal", organizationNumber: "" }),
  );
  assert.equal(result.ok, true);
  assert.equal(calls[0][1].organizationNumber, null);

  for (const input of [
    createForm({ category: "other" }),
    createForm({ category: "customer", organizationNumber: "" }),
    createForm({ category: "pilot", organizationNumber: "" }),
  ]) {
    const invalidSetup = setup();
    const invalidResult = await invalidSetup.core.createTenant(input);
    assert.equal(invalidResult.code, "validation_error");
    assert.equal(invalidResult.message, "Kontrollera angivna uppgifter.");
    assert.equal(invalidResult.ok, false);
    assert.equal(Object.keys(invalidResult.fieldErrors).length, 1);
    assert.equal(invalidSetup.calls.length, 0);
    assert.equal(invalidSetup.correlationCalls(), 0);
  }
});

test("update requires the full editable target, UUID and positive revision", async () => {
  const { calls, core } = setup();
  await core.updateTenant(updateForm());
  assert.deepEqual(calls[0], [
    "updateTenant",
    {
      administrativeNote: null,
      contactEmail: null,
      contactName: "Ada",
      contactPhone: null,
      correlationId: CORRELATION_ID,
      expectedRevision: 1,
      legalName: "Exempel AB",
      organizationNumber: "556016-0680",
      tenantId: TENANT_ID,
    },
  ]);

  for (const overrides of [
    { tenantId: "invalid" },
    { expectedRevision: "0" },
    { expectedRevision: "1.5" },
    { expectedRevision: "-1" },
    { legalName: "" },
  ]) {
    const invalidSetup = setup();
    const result = await invalidSetup.core.updateTenant(updateForm(overrides));
    assert.equal(result.ok, false);
    assert.equal(result.code, "validation_error");
    assert.equal(invalidSetup.calls.length, 0);
  }
});

test("state actions call only their dedicated service with no client target state", async () => {
  const { calls, core } = setup();
  const input = stateForm({ targetStatus: "client-controlled" });

  for (const method of [
    "pauseTenant",
    "activateTenant",
    "archiveTenant",
    "restoreTenant",
  ]) {
    await core[method](input);
  }

  assert.deepEqual(
    calls.map(([name]) => name),
    ["pauseTenant", "activateTenant", "archiveTenant", "restoreTenant"],
  );
  for (const [, serviceInput] of calls) {
    assert.deepEqual(serviceInput, {
      correlationId: CORRELATION_ID,
      expectedRevision: 1,
      tenantId: TENANT_ID,
    });
    assert.equal("targetStatus" in serviceInput, false);
  }
});

test("all stable service errors map to safe action results", async () => {
  const expectedMessages = {
    audit_failure: "Ändringen kunde inte sparas säkert.",
    conflict: "Uppgifterna har ändrats. Läs in dem igen.",
    invalid_state_transition: "Åtgärden är inte tillåten i aktuellt läge.",
    not_found: "Tenant kunde inte hittas.",
    unauthorized: "Åtkomst nekad.",
    unexpected_error: "Ett oväntat fel inträffade.",
    validation_error: "Kontrollera angivna uppgifter.",
  };

  for (const [code, message] of Object.entries(expectedMessages)) {
    const { core } = setup({
      pauseTenant: async () => {
        throw new TenantServiceError(code);
      },
    });
    const expected = {
      code,
      message,
      ok: false,
    };
    if (code === "validation_error") {
      expected.fieldErrors = {
        form: ["Kontrollera angivna uppgifter."],
      };
    }
    assert.deepEqual(await core.pauseTenant(stateForm()), expected);
  }
});

test("unknown failures are masked and framework control-flow errors are rethrown", async () => {
  const sensitiveError = new Error(`sensitive ${TENANT_ID}`);
  const originalError = console.error;
  console.error = () => {};
  try {
    const { core } = setup({
      createTenant: async () => {
        throw sensitiveError;
      },
    });
    const result = await core.createTenant(createForm());
    assert.deepEqual(result, {
      code: "unexpected_error",
      message: "Ett oväntat fel inträffade.",
      ok: false,
    });
    assert.equal(JSON.stringify(result).includes(TENANT_ID), false);
  } finally {
    console.error = originalError;
  }

  const controlFlowError = new Error("NEXT_REDIRECT");
  let correlationCalls = 0;
  const core = createTenantActionCore({
    createCorrelationId() {
      correlationCalls += 1;
      return CORRELATION_ID;
    },
    rethrowControlFlow(error) {
      if (error === controlFlowError) {
        throw error;
      }
    },
    services: {
      ...setup().core,
      activateTenant: async () => tenant,
      archiveTenant: async () => tenant,
      createTenant: async () => tenant,
      pauseTenant: async () => {
        throw controlFlowError;
      },
      restoreTenant: async () => tenant,
      updateTenant: async () => tenant,
    },
  });
  await assert.rejects(core.pauseTenant(stateForm()), controlFlowError);
  assert.equal(correlationCalls, 1);
});

test("conflict and no-op state failures do not produce success or a second service call", async () => {
  for (const code of ["conflict", "invalid_state_transition"]) {
    let calls = 0;
    const { core } = setup({
      updateTenant: async () => {
        calls += 1;
        throw new TenantServiceError(code);
      },
    });
    const result = await core.updateTenant(updateForm());
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(calls, 1);
  }
});
