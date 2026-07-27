import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("lifecycle client boundary uses only the four E7B actions", async () => {
  const controls = await source("../app/tenants/tenant-lifecycle-controls.tsx");
  assert.match(controls, /^"use client";/);
  for (const action of [
    "pauseTenantAction",
    "activateTenantAction",
    "archiveTenantAction",
    "restoreTenantAction",
  ]) {
    assert.match(controls, new RegExp(action));
  }
  assert.doesNotMatch(
    controls,
    /createTenantAction|updateTenantAction|listTenantAuditEvents|tenantservice|supabase|repository|service_role|\.from\(|\.rpc\(/i,
  );
});

test("state visibility is active pause/archive, paused activate/archive, archived restore", async () => {
  const controls = await source("../app/tenants/tenant-lifecycle-controls.tsx");
  assert.match(controls, /if \(archived\)/);
  assert.match(controls, /operation="restore"/);
  assert.match(
    controls,
    /operationalStatus === "active" \? "pause" : "activate"/,
  );
  assert.match(controls, /operation="archive"/);

  const detailPage = await source("../app/tenants/[tenantId]/page.tsx");
  assert.match(detailPage, /tenant\.archivedAt === null/);
  assert.match(detailPage, /Redigera/);
});

test("each lifecycle operation maps to its dedicated action without target status", async () => {
  const controls = await source("../app/tenants/tenant-lifecycle-controls.tsx");
  const mappings = [
    ["activate", "activateTenantAction"],
    ["archive", "archiveTenantAction"],
    ["pause", "pauseTenantAction"],
    ["restore", "restoreTenantAction"],
  ];
  for (const [operation, action] of mappings) {
    assert.match(
      controls,
      new RegExp(`${operation}: \\{[\\s\\S]*?action: ${action},`),
    );
  }
  assert.doesNotMatch(
    controls,
    /name="(?:targetStatus|operationalStatus|archivedAt|eventType)"/,
  );
});

test("expected revision and tenant ID are hidden untrusted inputs", async () => {
  const controls = await source("../app/tenants/tenant-lifecycle-controls.tsx");
  assert.match(controls, /name="tenantId" type="hidden" value=\{tenantId\}/);
  assert.match(controls, /name="expectedRevision"/);
  assert.match(controls, /value=\{expectedRevision\}/);
  assert.doesNotMatch(controls, /type="number"[^>]*expectedRevision/);
});

test("native dialogs provide proportional confirmations and archive consequences", async () => {
  const controls = await source("../app/tenants/tenant-lifecycle-controls.tsx");
  assert.match(controls, /<dialog/);
  assert.match(controls, /showModal\(\)/);
  assert.match(controls, /aria-labelledby=/);
  assert.match(controls, /aria-describedby=/);
  assert.match(controls, /Bekräfta paus/);
  assert.match(controls, /Bekräfta aktivering/);
  assert.match(controls, /Bekräfta arkivering/);
  assert.match(controls, /Bekräfta återställning/);
  assert.match(
    controls,
    /tas bort från den aktiva tenantlistan men raderas inte/,
  );
  assert.match(controls, /får aktiv operativ status/);
  assert.doesNotMatch(controls, /window\.confirm|confirm\(/);
});

test("dialog focus, cancel and pending states are explicit", async () => {
  const controls = await source("../app/tenants/tenant-lifecycle-controls.tsx");
  assert.match(controls, /cancelRef\.current\?\.focus\(\)/);
  assert.match(
    controls,
    /onClose=\{\(\) => triggerRef\.current\?\.focus\(\)\}/,
  );
  assert.match(controls, /dialogRef\.current\?\.close\(\)/);
  assert.match(controls, /disabled=\{isPending\}/);
  assert.match(controls, /aria-disabled=\{isPending\}/);
  for (const pending of [
    "Pausar…",
    "Aktiverar…",
    "Arkiverar…",
    "Återställer…",
  ]) {
    assert.match(controls, new RegExp(pending));
  }
});

test("conflict and invalid state are alerts without revision disclosure", async () => {
  const controls = await source("../app/tenants/tenant-lifecycle-controls.tsx");
  assert.match(controls, /role="alert"/);
  assert.match(controls, /result\.code === "conflict"/);
  assert.match(controls, /result\.code === "invalid_state_transition"/);
  assert.match(controls, /ladda om detail/);
  assert.doesNotMatch(
    controls,
    /actualRevision|databaseRevision|automatisk retry|overwrite/i,
  );
});

test("lifecycle successes selectively revalidate and refresh detail", async () => {
  const actions = await source("../app/tenants/actions.ts");
  const lifecycleActions = actions.slice(
    actions.indexOf("export async function pauseTenantAction"),
  );
  for (const method of [
    "pauseTenant",
    "activateTenant",
    "archiveTenant",
    "restoreTenant",
  ]) {
    assert.match(
      lifecycleActions,
      new RegExp(
        `completeLifecycleAction\\(await actions\\.${method}\\(formData\\)\\)`,
      ),
    );
  }
  const successBlock = lifecycleActions.match(
    /if \(result\.ok\) \{([\s\S]*?)\n  \}/,
  )?.[1];
  assert.ok(successBlock);
  assert.match(successBlock, /revalidatePath\("\/tenants"\)/);
  assert.match(successBlock, /revalidatePath\(detailPath\)/);
  assert.match(successBlock, /redirect\(detailPath\)/);
  assert.equal(
    successBlock.indexOf("revalidatePath") < successBlock.indexOf("redirect"),
    true,
  );
  assert.doesNotMatch(lifecycleActions, /revalidateTag|router\.push|delete/i);
});

test("detail renders lifecycle controls but no audit history", async () => {
  const detail = await source("../app/tenants/tenant-detail.tsx");
  assert.match(detail, /TenantLifecycleControls/);
  assert.match(detail, /expectedRevision=\{tenant\.revision\}/);
  assert.match(detail, /operationalStatus=\{tenant\.operationalStatus\}/);
  assert.doesNotMatch(
    detail,
    /listTenantAuditEvents|TenantAuditEvent|Audit history|timeline/i,
  );
});
