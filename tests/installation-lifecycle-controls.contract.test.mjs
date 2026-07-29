import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("lifecycle client boundary uses only the five installation actions", async () => {
  const controls = await source(
    "../app/installations/installation-lifecycle-controls.tsx",
  );
  assert.match(controls, /^"use client";/);
  for (const action of [
    "activateInstallationAction",
    "pauseInstallationAction",
    "decommissionInstallationAction",
    "archiveInstallationAction",
    "restoreInstallationAction",
  ])
    assert.match(controls, new RegExp(action));
  assert.doesNotMatch(
    controls,
    /createInstallationAction|updateInstallationAction|listInstallationAuditEvents|installationservice|supabase|repository|service_role|\.from\(|\.rpc\(/i,
  );
});

test("state visibility follows the exact installation lifecycle machine", async () => {
  const controls = await source(
    "../app/installations/installation-lifecycle-controls.tsx",
  );
  assert.match(controls, /archived\s*\?\s*\["restore"\]/);
  assert.match(
    controls,
    /administrativeStatus === "planned"[\s\S]*\["activate", "decommission"\]/,
  );
  assert.match(
    controls,
    /administrativeStatus === "active"[\s\S]*\["pause", "decommission"\]/,
  );
  assert.match(
    controls,
    /administrativeStatus === "paused"[\s\S]*\["activate", "decommission"\]/,
  );
  assert.match(controls, /:\s*\["archive"\]/);
});

test("each operation maps to its dedicated action without client system fields", async () => {
  const controls = await source(
    "../app/installations/installation-lifecycle-controls.tsx",
  );
  const mappings = [
    ["activate", "activateInstallationAction"],
    ["archive", "archiveInstallationAction"],
    ["decommission", "decommissionInstallationAction"],
    ["pause", "pauseInstallationAction"],
    ["restore", "restoreInstallationAction"],
  ];
  for (const [operation, action] of mappings)
    assert.match(
      controls,
      new RegExp(`${operation}: \\{[\\s\\S]*?action: ${action},`),
    );
  assert.match(
    controls,
    /name="installationId"[\s\S]*value=\{installationId\}/,
  );
  assert.match(
    controls,
    /name="expectedRevision"[\s\S]*value=\{expectedRevision\}/,
  );
  assert.doesNotMatch(
    controls,
    /name="(?:targetStatus|administrativeStatus|archivedAt|eventType|actor|correlationId|revisionAfter)"/,
  );
});

test("native dialogs explain proportional and exact lifecycle consequences", async () => {
  const controls = await source(
    "../app/installations/installation-lifecycle-controls.tsx",
  );
  assert.match(controls, /<dialog/);
  assert.match(controls, /showModal\(\)/);
  assert.match(controls, /aria-labelledby=/);
  assert.match(controls, /aria-describedby=/);
  for (const title of [
    "Bekräfta aktivering",
    "Bekräfta paus",
    "Bekräfta avveckling",
    "Bekräfta arkivering",
    "Bekräfta återställning",
  ])
    assert.match(controls, new RegExp(title));
  assert.match(
    controls,
    /verifierar inte faktisk systemhälsa, provisioning eller deployment/,
  );
  assert.doesNotMatch(controls, /teknisk metadata saknas/);
  assert.match(controls, /Åtgärden är reversibel/);
  assert.match(controls, /kan inte aktiveras igen genom normal lifecycle i V1/);
  assert.match(controls, /data och audit raderas inte/);
  assert.match(controls, /status förblir Avvecklad; den blir inte Aktiv/);
  assert.match(controls, /Ingen fysisk radering/);
  assert.doesNotMatch(controls, /window\.confirm|confirm\(/);
});

test("dialog focus, alerts and stable error guidance are accessible", async () => {
  const controls = await source(
    "../app/installations/installation-lifecycle-controls.tsx",
  );
  assert.match(controls, /cancelRef\.current\?\.focus\(\)/);
  assert.match(
    controls,
    /onClose=\{\(\) => triggerRef\.current\?\.focus\(\)\}/,
  );
  assert.match(controls, /dialogRef\.current\?\.close\(\)/);
  assert.match(controls, /role="alert"/);
  assert.match(controls, /result\.code === "conflict"/);
  assert.match(controls, /result\.code === "invalid_state_transition"/);
  assert.match(controls, /result\.code === "tenant_not_available"/);
  assert.match(controls, /ladda om detail/);
  assert.doesNotMatch(
    controls,
    /actualRevision|databaseRevision|overwrite|automatisk retry/i,
  );
});

test("pending is operation-specific and globally locks lifecycle races", async () => {
  const controls = await source(
    "../app/installations/installation-lifecycle-controls.tsx",
  );
  for (const pending of [
    "Aktiverar…",
    "Pausar…",
    "Avvecklar…",
    "Arkiverar…",
    "Återställer…",
  ])
    assert.match(controls, new RegExp(pending));
  assert.match(controls, /const controlsLocked = activeOperation !== null/);
  assert.match(controls, /disabled=\{controlsLocked\}/);
  assert.match(controls, /aria-disabled=\{controlsLocked\}/);
  assert.match(controls, /disabled=\{isPending\}/);
  assert.match(controls, /aria-disabled=\{isPending\}/);
  assert.match(controls, /onSubmit=\{\(\) => onStart\(operation\)\}/);
});

test("all lifecycle successes selectively revalidate and redirect detail", async () => {
  const actions = await source("../app/installations/actions.ts");
  for (const method of [
    "activateInstallation",
    "pauseInstallation",
    "decommissionInstallation",
    "archiveInstallation",
    "restoreInstallation",
  ])
    assert.match(
      actions,
      new RegExp(
        `completeFormAction\\(await actions\\.${method}\\(formData\\)\\)`,
      ),
    );
  const successBlock = actions.match(
    /function completeFormAction[\s\S]*?if \(result\.ok\) \{([\s\S]*?)\n  \}/,
  )?.[1];
  assert.ok(successBlock);
  assert.match(successBlock, /revalidatePath\("\/installations"\)/);
  assert.match(successBlock, /revalidatePath\(detailPath\)/);
  assert.match(successBlock, /redirect\(detailPath\)/);
  assert.equal(
    successBlock.indexOf("revalidatePath") < successBlock.indexOf("redirect"),
    true,
  );
  assert.doesNotMatch(actions, /revalidateTag|router\.push|delete/i);
});

test("detail integrates lifecycle without audit, delete or operational controls", async () => {
  const detail = await source("../app/installations/installation-detail.tsx");
  assert.match(detail, /InstallationLifecycleControls/);
  assert.match(
    detail,
    /administrativeStatus=\{installation\.administrativeStatus\}/,
  );
  assert.match(detail, /archived=\{installation\.archivedAt !== null\}/);
  assert.match(detail, /expectedRevision=\{installation\.revision\}/);
  assert.match(detail, /installationId=\{installation\.id\}/);
  assert.doesNotMatch(
    detail,
    /InstallationAudit|Händelsehistorik|provision|monitor|delete|badge/i,
  );
});
