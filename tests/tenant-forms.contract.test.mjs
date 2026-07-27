import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTenantActionCore } from "../lib/server/tenants/tenant-action-core.ts";
import { TenantServiceError } from "../lib/server/tenants/tenant.errors.ts";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const CORRELATION_ID = "00000000-0000-4000-8000-000000000301";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function formData(values) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) {
    data.set(name, value);
  }
  return data;
}

function baseCreate(overrides = {}) {
  return formData({
    administrativeNote: "",
    category: "customer",
    contactEmail: "",
    contactName: "",
    contactPhone: "",
    legalName: "Exempel AB",
    organizationNumber: "556016-0680",
    ...overrides,
  });
}

function baseUpdate(overrides = {}) {
  return formData({
    administrativeNote: "",
    contactEmail: "",
    contactName: "",
    contactPhone: "",
    expectedRevision: "1",
    legalName: "Exempel AB",
    organizationNumber: "556016-0680",
    tenantId: TENANT_ID,
    ...overrides,
  });
}

function actionCore(overrides = {}) {
  const tenant = {
    id: TENANT_ID,
    revision: 2,
  };
  const operation = async () => tenant;
  return createTenantActionCore({
    createCorrelationId: () => CORRELATION_ID,
    rethrowControlFlow() {},
    services: {
      activateTenant: operation,
      archiveTenant: operation,
      createTenant: operation,
      pauseTenant: operation,
      restoreTenant: operation,
      updateTenant: operation,
      ...overrides,
    },
  });
}

test("create and edit paths are dynamic and use only the locked server boundaries", async () => {
  const createPage = await source("../app/tenants/new/page.tsx");
  const editPage = await source("../app/tenants/[tenantId]/edit/page.tsx");

  assert.match(createPage, /requireOwnerIntegrity\(\)/);
  assert.match(createPage, /mode="create"/);
  assert.match(editPage, /await getTenantById\(tenantId\)/);
  assert.match(editPage, /mode="edit"/);

  for (const page of [createPage, editPage]) {
    assert.match(page, /dynamic = "force-dynamic"/);
    assert.match(page, /revalidate = 0/);
    assert.doesNotMatch(
      page,
      /supabase|tenant\.repository|createBrowserClient|service_role|\.from\(|\.rpc\(|listTenantAuditEvents/,
    );
  }
});

test("tenant form uses only create/update actions and the minimum client boundary", async () => {
  const form = await source("../app/tenants/tenant-form.tsx");
  assert.match(form, /^"use client";/);
  assert.match(form, /useActionState/);
  assert.match(form, /createTenantAction, updateTenantAction/);
  assert.doesNotMatch(
    form,
    /pauseTenantAction|activateTenantAction|archiveTenantAction|restoreTenantAction|listTenantAuditEvents|supabase|repository|\.rpc\(/,
  );
});

test("create form exposes exactly the allowed business fields", async () => {
  const form = await source("../app/tenants/tenant-form.tsx");

  for (const name of [
    "category",
    "organizationNumber",
    "legalName",
    "contactName",
    "contactEmail",
    "contactPhone",
    "administrativeNote",
  ]) {
    assert.match(form, new RegExp(`name="${name}"|field: "${name}"`));
  }

  for (const forbidden of [
    "operationalStatus",
    "countryCode",
    "createdBy",
    "updatedBy",
    "archivedAt",
    "archivedBy",
    "correlationId",
    "eventType",
  ]) {
    assert.doesNotMatch(form, new RegExp(`name="${forbidden}"`));
  }
  assert.match(form, /value="internal"/);
  assert.match(form, /Valfritt för intern tenant/);
});

test("edit keeps category read-only and transports concurrency fields as hidden inputs", async () => {
  const form = await source("../app/tenants/tenant-form.tsx");
  assert.match(form, /mode === "create" \? \(/);
  assert.match(form, /\(kan inte ändras\)/);
  assert.match(form, /name="tenantId"\s+type="hidden"/);
  assert.match(form, /name="expectedRevision"\s+type="hidden"/);
  assert.doesNotMatch(form, /type="number"[^>]*name="expectedRevision"/);

  const editPage = await source("../app/tenants/[tenantId]/edit/page.tsx");
  assert.match(editPage, /tenant\.archivedAt !== null/);
  assert.match(editPage, /Arkiverad tenant kan inte redigeras/);
});

test("field validation returns stable field-linked errors", async () => {
  const core = actionCore();

  const invalidCategory = await core.createTenant(
    baseCreate({ category: "other" }),
  );
  assert.deepEqual(invalidCategory.fieldErrors, {
    category: ["Välj en giltig kategori."],
  });

  const missingOrganization = await core.createTenant(
    baseCreate({ organizationNumber: "" }),
  );
  assert.deepEqual(missingOrganization.fieldErrors, {
    organizationNumber: ["Organisationsnummer krävs för kund och pilot."],
  });

  const internal = await core.createTenant(
    baseCreate({ category: "internal", organizationNumber: "" }),
  );
  assert.equal(internal.ok, true);

  const invalidRevision = await core.updateTenant(
    baseUpdate({ expectedRevision: "0" }),
  );
  assert.equal(invalidRevision.ok, false);
  assert.deepEqual(invalidRevision.fieldErrors, {
    expectedRevision: ["Revisionen är inte längre giltig. Läs in tenant igen."],
  });
});

test("conflict is a form-level result without retry, overwrite or revision disclosure", async () => {
  const core = actionCore({
    updateTenant: async () => {
      throw new TenantServiceError("conflict");
    },
  });
  const result = await core.updateTenant(baseUpdate());
  assert.deepEqual(result, {
    code: "conflict",
    message: "Uppgifterna har ändrats. Läs in dem igen.",
    ok: false,
  });

  const form = await source("../app/tenants/tenant-form.tsx");
  assert.match(form, /Posten har ändrats sedan sidan laddades/);
  assert.doesNotMatch(form, /automatisk|retry|overwrite|actualRevision/i);
});

test("create/update revalidate only list and detail then redirect on success", async () => {
  const actions = await source("../app/tenants/actions.ts");
  const createUpdateActions = actions.slice(
    0,
    actions.indexOf("export async function pauseTenantAction"),
  );
  const successBlocks = [
    ...createUpdateActions.matchAll(/if \(result\.ok\) \{([\s\S]*?)\n  \}/g),
  ];
  assert.equal(successBlocks.length, 2);

  for (const [, block] of successBlocks) {
    assert.match(block, /revalidatePath\("\/tenants"\)/);
    assert.match(block, /revalidatePath\(detailPath\)/);
    assert.match(block, /redirect\(detailPath\)/);
    assert.equal(
      block.indexOf("revalidatePath") < block.indexOf("redirect"),
      true,
    );
  }

  assert.equal(
    (createUpdateActions.match(/revalidatePath\(/g) ?? []).length,
    4,
  );
  assert.equal((createUpdateActions.match(/redirect\(/g) ?? []).length, 2);
  assert.doesNotMatch(createUpdateActions, /revalidateTag|router\.push/);
});

test("form labels, errors, pending state and cancel navigation are accessible", async () => {
  const form = await source("../app/tenants/tenant-form.tsx");
  assert.match(form, /htmlFor="category"/);
  assert.match(form, /htmlFor="organizationNumber"/);
  assert.match(form, /htmlFor="legalName"/);
  assert.match(form, /htmlFor="administrativeNote"/);
  assert.match(form, /aria-invalid=/);
  assert.match(form, /aria-describedby=/);
  assert.match(form, /role="alert"/);
  assert.match(form, /tabIndex=\{-1\}/);
  assert.match(form, /summaryRef\.current\?\.focus\(\)/);
  assert.match(form, /disabled=\{isPending\}/);
  assert.match(form, /Sparar…/);
  assert.match(form, /Avbryt/);
});

test("list and unarchived detail expose working create/edit links only", async () => {
  const listPage = await source("../app/tenants/page.tsx");
  const detailPage = await source("../app/tenants/[tenantId]/page.tsx");
  assert.match(listPage, /href="\/tenants\/new"/);
  assert.match(detailPage, /tenant\.archivedAt === null/);
  assert.match(detailPage, /href=\{`\/tenants\/\$\{tenant\.id\}\/edit`\}/);
  assert.doesNotMatch(
    `${listPage}\n${detailPage}`,
    /pauseTenantAction|activateTenantAction|archiveTenantAction|restoreTenantAction|listTenantAuditEvents/,
  );
});
