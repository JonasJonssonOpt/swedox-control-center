import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  getProvisioningStepProvider,
  isProvisioningStepKey,
  listProvisioningStepProviders,
  ProvisioningProviderError,
} from "../lib/server/provisioning/providers/index.ts";

function expectFieldError(fn, field) {
  assert.throws(fn, (error) => {
    assert.equal(error instanceof ProvisioningProviderError, true);
    assert.equal(error.code, "validation_error");
    assert.equal(error.field, field);
    assert.ok(error.message.length > 0);
    return true;
  });
}

test("provider catalog is exactly the database catalog, in order, all manual", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261006220000_add_provisioning_initial_administrator_step.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const constraint = migration.slice(
    migration.indexOf("add constraint ck_provisioning_run_steps_catalog"),
    migration.indexOf("alter table public.provisioning_audit_events"),
  );
  const database = [
    ...constraint.matchAll(/\('([a-z_]+)', (\d)::smallint\)/g),
  ].map((match) => [match[1], Number(match[2])]);
  const providers = listProvisioningStepProviders();
  assert.deepEqual(
    providers.map((provider) => [provider.stepKey, provider.position]),
    database,
  );
  assert.equal(database.length, 5);
  for (const provider of providers) {
    assert.equal(provider.kind, "manual");
    assert.equal(Object.isFrozen(provider), true);
    assert.equal(Object.isFrozen(provider.runbook.instructions), true);
    assert.ok(provider.runbook.title.length > 0);
    assert.ok(provider.runbook.instructions.length >= 2);
    assert.equal(getProvisioningStepProvider(provider.stepKey), provider);
    assert.equal(isProvisioningStepKey(provider.stepKey), true);
  }
  assert.throws(
    () => getProvisioningStepProvider("deploy_everything"),
    /unknown_provisioning_step/,
  );
  assert.equal(isProvisioningStepKey("deploy_everything"), false);
});

test("each step owns exactly the results complete_provisioning_step accepts", () => {
  assert.deepEqual(
    listProvisioningStepProviders().map((p) => [
      p.stepKey,
      p.runbook.resultFields,
    ]),
    [
      ["supabase_project", ["supabaseProjectRef", "hostingRegion"]],
      ["database_schema", []],
      ["application_deployment", ["applicationUrl"]],
      ["initial_administrator", []],
      ["installation_verification", []],
    ],
  );
  const project = getProvisioningStepProvider("supabase_project");
  assert.deepEqual(
    project.normalizeResults({
      hostingRegion: " eu-north-1 ",
      supabaseProjectRef: " abcdefghij0123456789 ",
    }),
    {
      applicationUrl: null,
      hostingRegion: "eu-north-1",
      supabaseProjectRef: "abcdefghij0123456789",
    },
  );
  assert.equal(
    Object.isFrozen(
      project.normalizeResults({
        hostingRegion: "eu-north-1",
        supabaseProjectRef: "p1",
      }),
    ),
    true,
  );
  const deployment = getProvisioningStepProvider("application_deployment");
  assert.deepEqual(
    deployment.normalizeResults({
      applicationUrl: "https://kund.swedox.se/app?x=1",
      hostingRegion: "",
    }),
    {
      applicationUrl: "https://kund.swedox.se/app?x=1",
      hostingRegion: null,
      supabaseProjectRef: null,
    },
  );
  for (const key of [
    "database_schema",
    "initial_administrator",
    "installation_verification",
  ]) {
    const provider = getProvisioningStepProvider(key);
    assert.deepEqual(provider.normalizeResults(undefined), {
      applicationUrl: null,
      hostingRegion: null,
      supabaseProjectRef: null,
    });
    assert.deepEqual(
      provider.normalizeResults({
        applicationUrl: "",
        supabaseProjectRef: null,
      }),
      {
        applicationUrl: null,
        hostingRegion: null,
        supabaseProjectRef: null,
      },
    );
    expectFieldError(
      () =>
        provider.normalizeResults({ applicationUrl: "https://x.example.se" }),
      "applicationUrl",
    );
  }
});

test("result validation matches the database formats and rejects foreign fields", () => {
  const project = getProvisioningStepProvider("supabase_project");
  expectFieldError(
    () => project.normalizeResults({ hostingRegion: "eu-north-1" }),
    "supabaseProjectRef",
  );
  expectFieldError(
    () => project.normalizeResults({ supabaseProjectRef: "p1" }),
    "hostingRegion",
  );
  expectFieldError(
    () =>
      project.normalizeResults({
        hostingRegion: "eu-north-1",
        supabaseProjectRef: "Proj1",
      }),
    "supabaseProjectRef",
  );
  expectFieldError(
    () =>
      project.normalizeResults({
        hostingRegion: "eu-north-1",
        supabaseProjectRef: "p".repeat(65),
      }),
    "supabaseProjectRef",
  );
  expectFieldError(
    () =>
      project.normalizeResults({
        hostingRegion: "eu north",
        supabaseProjectRef: "p1",
      }),
    "hostingRegion",
  );
  expectFieldError(
    () =>
      project.normalizeResults({
        hostingRegion: "eu--north",
        supabaseProjectRef: "p1",
      }),
    "hostingRegion",
  );
  expectFieldError(
    () =>
      project.normalizeResults({ hostingRegion: 7, supabaseProjectRef: "p1" }),
    "hostingRegion",
  );
  expectFieldError(
    () =>
      project.normalizeResults({
        applicationUrl: "https://x.example.se",
        hostingRegion: "eu-north-1",
        supabaseProjectRef: "p1",
      }),
    "applicationUrl",
  );
  expectFieldError(
    () =>
      project.normalizeResults({
        serviceRoleKey: "x",
        supabaseProjectRef: "p1",
      }),
    "form",
  );
  expectFieldError(() => project.normalizeResults("p1"), "form");
  expectFieldError(() => project.normalizeResults([]), "form");

  const deployment = getProvisioningStepProvider("application_deployment");
  for (const url of [
    "http://kund.swedox.se",
    "https://user:pw@kund.swedox.se",
    "https://kund.swedox.se/#admin",
    "https://kund.swedox.se/ a",
    "https://-kund.swedox.se",
    "https://",
    "ftp://kund.swedox.se",
    `https://k.se/${"a".repeat(2040)}`,
  ]) {
    expectFieldError(
      () => deployment.normalizeResults({ applicationUrl: url }),
      "applicationUrl",
    );
  }
  for (const url of [
    "https://kund.swedox.se",
    "https://kund.swedox.se:8443/start",
    "https://10.0.0.1/x?y=1",
  ]) {
    assert.equal(
      deployment.normalizeResults({ applicationUrl: url }).applicationUrl,
      url,
    );
  }
});

test("runbooks keep secrets out of Control Center and describe the administrator step", () => {
  const byKey = Object.fromEntries(
    listProvisioningStepProviders().map((p) => [p.stepKey, p.runbook]),
  );
  for (const key of [
    "supabase_project",
    "application_deployment",
    "initial_administrator",
  ]) {
    assert.match(
      byKey[key].instructions.join(" "),
      /aldrig[^.]*Control Center/,
      key,
    );
  }
  assert.match(
    byKey.initial_administrator.instructions.join(" "),
    /rollen admin/,
  );
  assert.match(byKey.initial_administrator.instructions.join(" "), /inbjudan/);
  assert.match(
    byKey.installation_verification.instructions.join(" "),
    /Monitoring/,
  );
  assert.match(byKey.supabase_project.instructions.join(" "), /eu-north-1/);
});

test("provider layer is server-only and makes no network calls or secret reads", async () => {
  const root = new URL(
    "../lib/server/provisioning/providers/",
    import.meta.url,
  );
  const files = (await readdir(root))
    .filter((name) => name.endsWith(".ts"))
    .sort();
  assert.deepEqual(files, [
    "index.ts",
    "manual-provider.ts",
    "provider.types.ts",
    "registry.ts",
  ]);
  for (const file of files) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.match(source, /^import "server-only";/, file);
    assert.doesNotMatch(
      source,
      /fetch\(|process\.env|child_process|node:http|node:net|createClient|createServerClient|supabase-js|service[_ -]?role|\.rpc\(/i,
      file,
    );
  }
});
