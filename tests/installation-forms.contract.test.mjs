import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("create route offers only active nonarchived tenants and blocks empty state", async () => {
  const page = await source("../app/installations/new/page.tsx");
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /revalidate = 0/);
  assert.match(page, /listTenants\(\)/);
  assert.match(page, /tenant\.operationalStatus === "active"/);
  assert.match(page, /tenant\.archivedAt === null/);
  assert.match(page, /tenants\.length === 0/);
  assert.match(page, /Ingen aktiv tenant är tillgänglig/);
  assert.match(page, /<InstallationForm/);
  assert.doesNotMatch(
    page,
    /"use client"|fetch\(|\/api\/installations|createBrowserClient|\.from\(|\.rpc\(/,
  );
});

test("edit route reads fresh detail, maps not found and withholds archived form", async () => {
  const page = await source(
    "../app/installations/[installationId]/edit/page.tsx",
  );
  assert.match(page, /getInstallationById\(installationId\)/);
  assert.match(page, /unstable_rethrow\(error\)/);
  assert.match(page, /error\.code === "not_found"/);
  assert.match(page, /installation\.archivedAt !== null/);
  assert.match(page, /Arkiverad installation kan inte redigeras/);
  assert.match(page, /expectedRevision: installation\.revision/);
  assert.match(
    page,
    /administrativeStatus: installation\.administrativeStatus/,
  );
  assert.doesNotMatch(
    page,
    /activateInstallationAction|pauseInstallationAction|decommissionInstallationAction|archiveInstallationAction|restoreInstallationAction/,
  );
});

test("shared form posts exact create and update fields through server actions", async () => {
  const form = await source("../app/installations/installation-form.tsx");
  assert.match(form, /^"use client";/);
  assert.match(form, /useActionState/);
  assert.match(form, /createInstallationAction/);
  assert.match(form, /updateInstallationAction/);
  for (const field of [
    "tenantId",
    "installationCode",
    "displayName",
    "environment",
    "applicationUrl",
    "supabaseProjectRef",
    "hostingRegion",
    "administrativeNote",
    "installationId",
    "expectedRevision",
  ])
    assert.match(form, new RegExp(`\\b${field}\\b`));
  assert.match(form, /name=\{field\.field\}/);
  assert.doesNotMatch(
    form,
    /name="(?:administrativeStatus|archivedAt|revision|createdAt|updatedAt)"/,
  );
  assert.doesNotMatch(
    form,
    /fetch\(|\/api\/installations|createBrowserClient|\.from\(|\.rpc\(/,
  );
});

test("edit keeps identity and status readonly while mutable metadata remains editable", async () => {
  const form = await source("../app/installations/installation-form.tsx");
  assert.match(form, /mode === "create"[\s\S]*name="tenantId"/);
  assert.match(form, /mode === "create"[\s\S]*name="installationCode"/);
  assert.match(form, /mode === "create"[\s\S]*name="environment"/);
  assert.match(form, /tenantLegalName/);
  assert.match(form, /statusLabel\(initialValues\.administrativeStatus\)/);
  assert.match(form, /kan inte ändras/);
  assert.match(form, /type="hidden"/);
});

test("form exposes field errors, focused summary, conflict recovery and pending lock", async () => {
  const form = await source("../app/installations/installation-form.tsx");
  assert.match(form, /role="alert"/);
  assert.match(form, /tabIndex=\{-1\}/);
  assert.match(form, /summaryRef\.current\?\.focus\(\)/);
  assert.match(form, /aria-invalid=\{hasError/);
  assert.match(form, /aria-describedby=\{describedBy/);
  assert.match(form, /result\.fieldErrors\?\.\[field\]/);
  assert.match(form, /result\.code === "conflict"/);
  assert.match(form, /disabled=\{isPending\}/);
  assert.match(form, /Skapar…/);
  assert.match(form, /Sparar…/);
});

test("create and update redirect only after success with selective revalidation", async () => {
  const actions = await source("../app/installations/actions.ts");
  assert.match(
    actions,
    /completeFormAction\(await actions\.createInstallation/,
  );
  assert.match(
    actions,
    /completeFormAction\(await actions\.updateInstallation/,
  );
  assert.match(actions, /if \(result\.ok\)/);
  assert.match(actions, /revalidatePath\("\/installations"\)/);
  assert.match(actions, /revalidatePath\(detailPath\)/);
  assert.match(actions, /redirect\(detailPath\)/);
  assert.match(actions, /return result/);
});
