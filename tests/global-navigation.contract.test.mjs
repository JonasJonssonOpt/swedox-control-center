import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("root redirects permanently into the first available module", async () => {
  const root = await source("../app/page.tsx");
  assert.match(root, /redirect\("\/tenants"\)/);
  assert.doesNotMatch(root, /<main|Dashboard|placeholder/i);
});

test("control center shell owns the permanent semantic application frame", async () => {
  const shell = await source("../components/layout/control-center-shell.tsx");
  assert.match(shell, /<aside/);
  assert.match(shell, /<nav aria-label="Huvudnavigation"/);
  assert.match(shell, /<header/);
  assert.match(shell, /<main/);
  assert.match(shell, />Control Center</);
  assert.match(shell, />Verifierad owner</);
  assert.match(shell, /focus-visible:outline-2/);
  assert.doesNotMatch(
    shell,
    /avatar|profil|sök|search|notification|notifier|logga ut|logout|badge/i,
  );
});

test("Tenants, Installations and Licenses are actionable and support active module state", async () => {
  const shell = await source("../components/layout/control-center-shell.tsx");

  for (const label of [
    "Dashboard",
    "Tenants",
    "Installations",
    "Licenses",
    "Provisioning",
    "Monitoring",
    "Settings",
  ]) {
    assert.match(shell, new RegExp(`label: "${label}"`));
  }

  assert.equal((shell.match(/href:/g) ?? []).length, 3);
  assert.match(shell, /href: "\/tenants"/);
  assert.match(shell, /href: "\/installations"/);
  assert.match(shell, /href: "\/licenses"/);
  assert.match(
    shell,
    /activeModule: "installations" \| "licenses" \| "tenants"/,
  );
  assert.match(shell, /aria-current=/);
  assert.match(shell, /\? "page" : undefined/);
  assert.match(shell, /Kommer senare/);
  assert.doesNotMatch(shell, /rounded-full|pill|badge/i);
});

test("tenant routes consume one shell without nested main landmarks", async () => {
  const paths = [
    "../app/tenants/page.tsx",
    "../app/tenants/new/page.tsx",
    "../app/tenants/[tenantId]/page.tsx",
    "../app/tenants/[tenantId]/edit/page.tsx",
    "../app/tenants/loading.tsx",
    "../app/tenants/error.tsx",
    "../app/tenants/[tenantId]/loading.tsx",
    "../app/tenants/[tenantId]/not-found.tsx",
  ];
  const [layout, ...pages] = await Promise.all([
    source("../app/tenants/layout.tsx"),
    ...paths.map(source),
  ]);

  assert.match(layout, /ControlCenterShell activeModule="tenants"/);
  for (const page of pages) {
    assert.doesNotMatch(page, /<main/);
  }
});

test("installation routes consume the shared shell without changing root", async () => {
  const layout = await source("../app/installations/layout.tsx");
  const list = await source("../app/installations/page.tsx");
  const detail = await source("../app/installations/[installationId]/page.tsx");
  assert.match(layout, /ControlCenterShell activeModule="installations"/);
  assert.doesNotMatch(list, /<main/);
  assert.doesNotMatch(detail, /<main/);
  const root = await source("../app/page.tsx");
  assert.match(root, /redirect\("\/tenants"\)/);
});

test("license routes consume the shared shell without nested main landmarks", async () => {
  const layout = await source("../app/licenses/layout.tsx");
  assert.match(layout, /ControlCenterShell activeModule="licenses"/);
  for (const path of [
    "../app/licenses/page.tsx",
    "../app/licenses/new/page.tsx",
    "../app/licenses/[licenseId]/page.tsx",
    "../app/licenses/[licenseId]/edit/page.tsx",
    "../app/licenses/loading.tsx",
    "../app/licenses/error.tsx",
    "../app/licenses/[licenseId]/loading.tsx",
    "../app/licenses/[licenseId]/not-found.tsx",
  ]) {
    assert.doesNotMatch(await source(path), /<main/);
  }
});

test("future modules have no routes or placeholder pages", async () => {
  for (const moduleName of [
    "dashboard",
    "provisioning",
    "monitoring",
    "settings",
  ]) {
    try {
      const entries = await readdir(
        new URL(`../app/${moduleName}`, import.meta.url),
        { recursive: true },
      );
      assert.equal(
        entries.some((entry) =>
          /(?:^|[\\/])(?:page|layout|loading|error|not-found|route)\.[jt]sx?$/.test(
            entry,
          ),
        ),
        false,
      );
    } catch (error) {
      assert.equal(error?.code, "ENOENT");
    }
  }
});
