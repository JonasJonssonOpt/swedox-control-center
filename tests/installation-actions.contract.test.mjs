import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createInstallationActionCore } from "../lib/server/installations/installation-action-core.ts";
import { InstallationServiceError } from "../lib/server/installations/installation.errors.ts";

const INSTALLATION_ID = "00000000-0000-4000-8000-000000000101";
const TENANT_ID = "00000000-0000-4000-8000-000000000201";
const CORRELATION_ID = "00000000-0000-4000-8000-000000000301";

const installation = Object.freeze({
  administrativeNote: null,
  administrativeStatus: "planned",
  applicationUrl: null,
  archivedAt: null,
  createdAt: "2026-07-29T12:00:00.000Z",
  displayName: "Example Production",
  environment: "production",
  hostingRegion: null,
  id: INSTALLATION_ID,
  installationCode: "example-production",
  revision: 2,
  supabaseProjectRef: null,
  tenantId: TENANT_ID,
  updatedAt: "2026-07-29T12:00:00.000Z",
});

function formData(values) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}
function createForm(overrides = {}) {
  return formData({
    administrativeNote: "",
    applicationUrl: "",
    displayName: " Example Production ",
    environment: "production",
    hostingRegion: "",
    installationCode: "example-production",
    supabaseProjectRef: "",
    tenantId: TENANT_ID,
    ...overrides,
  });
}
function updateForm(overrides = {}) {
  return formData({
    administrativeNote: "",
    applicationUrl: "",
    displayName: " Example Production ",
    expectedRevision: "1",
    hostingRegion: "",
    installationId: INSTALLATION_ID,
    supabaseProjectRef: "",
    ...overrides,
  });
}
function lifecycleForm(overrides = {}) {
  return formData({
    expectedRevision: "1",
    installationId: INSTALLATION_ID,
    ...overrides,
  });
}
function setup(overrides = {}) {
  const calls = [];
  let correlationCalls = 0;
  const operation = (name) => async (input) => {
    calls.push([name, input]);
    return installation;
  };
  const services = {
    activateInstallation: operation("activateInstallation"),
    archiveInstallation: operation("archiveInstallation"),
    createInstallation: operation("createInstallation"),
    decommissionInstallation: operation("decommissionInstallation"),
    pauseInstallation: operation("pauseInstallation"),
    restoreInstallation: operation("restoreInstallation"),
    updateInstallation: operation("updateInstallation"),
    ...overrides,
  };
  const core = createInstallationActionCore({
    createCorrelationId() {
      correlationCalls += 1;
      return CORRELATION_ID;
    },
    rethrowControlFlow() {},
    services,
  });
  return { calls, core, correlationCalls: () => correlationCalls };
}

test("action module exports exactly seven use-server actions with service-only architecture", async () => {
  const source = await readFile(
    new URL("../app/installations/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /^"use server";/);
  assert.match(source, /import "server-only";/);
  assert.match(source, /@\/lib\/server\/installations/);
  assert.deepEqual(
    [...source.matchAll(/export async function (\w+)/g)].map(
      (match) => match[1],
    ),
    [
      "createInstallationAction",
      "updateInstallationAction",
      "activateInstallationAction",
      "pauseInstallationAction",
      "decommissionInstallationAction",
      "archiveInstallationAction",
      "restoreInstallationAction",
    ],
  );
  assert.doesNotMatch(
    source,
    /supabase|repository|createBrowserClient|service[_ -]?role|\.from\(|\.rpc\(/i,
  );
  assert.match(source, /revalidatePath\("\/installations"\)/);
  assert.match(source, /revalidatePath\(detailPath\)/);
  assert.match(source, /redirect\(detailPath\)/);
  assert.match(source, /if \(result\.ok\)/);
  assert.doesNotMatch(source, /revalidateTag|genericMutation/i);
  const core = await readFile(
    new URL(
      "../lib/server/installations/installation-action-core.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(core, /^import "server-only";/);
  assert.match(core, /InstallationActionCoreDependencies/);
});

test("create trims fields, normalizes nullable values and generates correlation server-side", async () => {
  const { calls, core, correlationCalls } = setup();
  const result = await core.createInstallation(
    createForm({
      actorUserId: "client",
      administrativeStatus: "active",
      archivedAt: "client",
      changedFields: "client",
      correlationId: "client",
      eventType: "client",
      revision: "999",
      targetStatus: "active",
    }),
  );
  assert.deepEqual(result, {
    installationId: INSTALLATION_ID,
    ok: true,
    revision: 2,
  });
  assert.deepEqual(calls, [
    [
      "createInstallation",
      {
        administrativeNote: null,
        applicationUrl: null,
        correlationId: CORRELATION_ID,
        displayName: "Example Production",
        environment: "production",
        hostingRegion: null,
        installationCode: "example-production",
        supabaseProjectRef: null,
        tenantId: TENANT_ID,
      },
    ],
  ]);
  assert.equal(correlationCalls(), 1);
  assert.equal(JSON.stringify(result).includes(CORRELATION_ID), false);
});

test("create accepts canonical optional metadata and validates environment and code", async () => {
  const { calls, core } = setup();
  await core.createInstallation(
    createForm({
      administrativeNote: " Restricted ",
      applicationUrl: " https://example.supabase.co/app ",
      hostingRegion: " eu-north-1 ",
      supabaseProjectRef: " projectref123 ",
    }),
  );
  assert.deepEqual(calls[0][1], {
    administrativeNote: "Restricted",
    applicationUrl: "https://example.supabase.co/app",
    correlationId: CORRELATION_ID,
    displayName: "Example Production",
    environment: "production",
    hostingRegion: "eu-north-1",
    installationCode: "example-production",
    supabaseProjectRef: "projectref123",
    tenantId: TENANT_ID,
  });
});

test("update requires and forwards the full mutable target while ignoring immutable fields", async () => {
  const { calls, core } = setup();
  await core.updateInstallation(
    updateForm({
      environment: "staging",
      installationCode: "client-change",
      status: "active",
      tenantId: "client-change",
    }),
  );
  assert.deepEqual(calls, [
    [
      "updateInstallation",
      {
        administrativeNote: null,
        applicationUrl: null,
        correlationId: CORRELATION_ID,
        displayName: "Example Production",
        expectedRevision: 1,
        hostingRegion: null,
        installationId: INSTALLATION_ID,
        supabaseProjectRef: null,
      },
    ],
  ]);

  for (const missing of [
    "displayName",
    "applicationUrl",
    "supabaseProjectRef",
    "hostingRegion",
    "administrativeNote",
  ]) {
    const values = {
      administrativeNote: "",
      applicationUrl: "",
      displayName: "Example Production",
      expectedRevision: "1",
      hostingRegion: "",
      installationId: INSTALLATION_ID,
      supabaseProjectRef: "",
    };
    delete values[missing];
    const invalid = setup();
    const result = await invalid.core.updateInstallation(formData(values));
    assert.equal(result.code, "validation_error");
    assert.equal(invalid.calls.length, 0);
    assert.equal(invalid.correlationCalls(), 0);
  }
});

test("each lifecycle action calls only its matching service with ID, revision and server correlation", async () => {
  const { calls, core, correlationCalls } = setup();
  const input = lifecycleForm({
    actor: "client",
    correlationId: "client",
    eventType: "client",
    targetStatus: "active",
  });
  for (const method of [
    "activateInstallation",
    "pauseInstallation",
    "decommissionInstallation",
    "archiveInstallation",
    "restoreInstallation",
  ])
    await core[method](input);

  assert.deepEqual(
    calls.map(([name]) => name),
    [
      "activateInstallation",
      "pauseInstallation",
      "decommissionInstallation",
      "archiveInstallation",
      "restoreInstallation",
    ],
  );
  for (const [, serviceInput] of calls) {
    assert.deepEqual(serviceInput, {
      correlationId: CORRELATION_ID,
      expectedRevision: 1,
      installationId: INSTALLATION_ID,
    });
  }
  assert.equal(correlationCalls(), 5);
});

test("boundary validation produces field errors and never reaches service or correlation generation", async () => {
  const cases = [
    [createForm({ tenantId: "bad" }), "createInstallation", "tenantId"],
    [
      createForm({ installationCode: "Bad Code" }),
      "createInstallation",
      "installationCode",
    ],
    [createForm({ displayName: "" }), "createInstallation", "displayName"],
    [createForm({ environment: "pilot" }), "createInstallation", "environment"],
    [
      createForm({ applicationUrl: "http://example.com" }),
      "createInstallation",
      "applicationUrl",
    ],
    [
      createForm({ supabaseProjectRef: "BAD_REF" }),
      "createInstallation",
      "supabaseProjectRef",
    ],
    [
      createForm({ hostingRegion: "EU North" }),
      "createInstallation",
      "hostingRegion",
    ],
    [
      createForm({ administrativeNote: "x".repeat(1001) }),
      "createInstallation",
      "administrativeNote",
    ],
    [
      updateForm({ installationId: "bad" }),
      "updateInstallation",
      "installationId",
    ],
    [
      updateForm({ expectedRevision: "0" }),
      "updateInstallation",
      "expectedRevision",
    ],
    [
      updateForm({ expectedRevision: "1.5" }),
      "updateInstallation",
      "expectedRevision",
    ],
  ];
  for (const [input, method, field] of cases) {
    const current = setup();
    const result = await current.core[method](input);
    assert.equal(result.ok, false);
    assert.equal(result.code, "validation_error");
    assert.deepEqual(Object.keys(result.fieldErrors), [field]);
    assert.equal(current.calls.length, 0);
    assert.equal(current.correlationCalls(), 0);
  }
});

test("all nine stable service errors map to safe Swedish action results", async () => {
  const expectedMessages = {
    audit_failure: "Ändringen kunde inte sparas säkert.",
    conflict: "Installationen har ändrats. Läs in den igen.",
    duplicate_installation:
      "En installation med samma identifierare finns redan.",
    invalid_state_transition: "Åtgärden är inte tillåten i aktuellt läge.",
    not_found: "Installationen kunde inte hittas.",
    tenant_not_available: "Vald tenant är inte tillgänglig för ändringen.",
    unauthorized: "Åtkomst nekad.",
    unexpected_error: "Ett oväntat fel inträffade.",
    validation_error: "Kontrollera angivna uppgifter.",
  };
  for (const [code, message] of Object.entries(expectedMessages)) {
    let calls = 0;
    const { core } = setup({
      pauseInstallation: async () => {
        calls += 1;
        throw new InstallationServiceError(code);
      },
    });
    const result = await core.pauseInstallation(lifecycleForm());
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(result.message, message);
    assert.equal(calls, 1);
    if (code === "validation_error") {
      assert.deepEqual(result.fieldErrors, {
        form: ["Kontrollera angivna uppgifter."],
      });
    }
  }
});

test("raw failures are masked and framework control flow is rethrown", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const { core } = setup({
      createInstallation: async () => {
        throw new Error(`raw SQL ${TENANT_ID}`);
      },
    });
    const result = await core.createInstallation(createForm());
    assert.deepEqual(result, {
      code: "unexpected_error",
      message: "Ett oväntat fel inträffade.",
      ok: false,
    });
    assert.equal(JSON.stringify(result).includes(TENANT_ID), false);
  } finally {
    console.error = originalError;
  }

  const controlFlow = new Error("NEXT_REDIRECT");
  const base = setup();
  const core = createInstallationActionCore({
    createCorrelationId: () => CORRELATION_ID,
    rethrowControlFlow(error) {
      if (error === controlFlow) throw error;
    },
    services: {
      activateInstallation: async () => installation,
      archiveInstallation: async () => installation,
      createInstallation: async () => installation,
      decommissionInstallation: async () => installation,
      pauseInstallation: async () => {
        throw controlFlow;
      },
      restoreInstallation: async () => installation,
      updateInstallation: async () => installation,
    },
  });
  await assert.rejects(core.pauseInstallation(lifecycleForm()), controlFlow);
  assert.equal(base.calls.length, 0);
});

test("conflict and state failures are never retried", async () => {
  for (const code of ["conflict", "invalid_state_transition"]) {
    let calls = 0;
    const { core } = setup({
      updateInstallation: async () => {
        calls += 1;
        throw new InstallationServiceError(code);
      },
    });
    const result = await core.updateInstallation(updateForm());
    assert.equal(result.code, code);
    assert.equal(calls, 1);
  }
});

test("installation API remains GET-only with no mutation handlers", async () => {
  for (const path of [
    "../app/api/installations/route.ts",
    "../app/api/installations/[installationId]/route.ts",
    "../app/api/installations/[installationId]/audit/route.ts",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /export const (POST|PUT|PATCH|DELETE)/);
  }
});
