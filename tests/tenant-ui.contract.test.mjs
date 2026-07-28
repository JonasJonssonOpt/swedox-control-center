import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatOrganizationNumber,
  formatTenantDateTime,
  tenantCategoryLabel,
  tenantStatusLabel,
  valueOrMissing,
} from "../lib/server/tenants/tenant-presentation.ts";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("tenant pages are dynamic server components with service-only data access", async () => {
  const listPage = await source("../app/tenants/page.tsx");
  const detailPage = await source("../app/tenants/[tenantId]/page.tsx");

  for (const page of [listPage, detailPage]) {
    assert.match(page, /dynamic = "force-dynamic"/);
    assert.match(page, /revalidate = 0/);
    assert.match(page, /@\/lib\/server\/tenants/);
    assert.doesNotMatch(
      page,
      /"use client"|supabase|tenant\.repository|createBrowserClient|service_role|\.from\(|\.rpc\(/,
    );
  }

  assert.match(listPage, /await listTenants\(\)/);
  assert.match(detailPage, /await getTenantById\(tenantId\)/);
  assert.match(detailPage, /await listTenantAuditEvents\(/);
  assert.match(detailPage, /pageSize: 25/);
});

test("tenant list keeps service order and renders the locked compact columns", async () => {
  const list = await source("../app/tenants/tenant-list.tsx");

  for (const heading of [
    "Juridiskt namn",
    "Organisationsnummer",
    "Kategori",
    "Status",
    "Kontaktperson",
    "Uppdaterad",
  ]) {
    assert.match(list, new RegExp(heading));
  }

  assert.match(list, /tenants\.map/);
  assert.doesNotMatch(list, /\.sort\(|search|filter|pagination|totalCount/i);
  assert.match(list, /href=\{`\/tenants\/\$\{tenant\.id\}`\}/);
  assert.match(list, /<StatusText>/);
  assert.doesNotMatch(list, /badge/i);
  assert.match(list, /scope="col"/);
  assert.match(list, /scope="row"/);
});

test("tenant list has a neutral empty state and explicit nullable values", async () => {
  const list = await source("../app/tenants/tenant-list.tsx");
  assert.match(list, /tenants\.length === 0/);
  assert.match(list, /Inga tenants att visa/);
  assert.match(list, /valueOrMissing\(tenant\.contactName\)/);
  assert.match(list, /formatOrganizationNumber\(tenant\.organizationNumber\)/);
});

test("tenant detail contains identity, contact, status, administration and safe metadata", async () => {
  const detail = await source("../app/tenants/tenant-detail.tsx");

  for (const value of [
    "Identitet",
    "Juridiskt namn",
    "Organisationsnummer",
    "Kategori",
    "Land",
    "Kontakt",
    "Kontaktperson",
    "E-post",
    "Telefon",
    "Operativ status",
    "Arkiveringsstatus",
    "Revision",
    "Administration",
    "Metadata",
    "Skapad",
    "Senast uppdaterad",
  ]) {
    assert.match(detail, new RegExp(value));
  }

  assert.match(detail, /Denna tenant är arkiverad/);
  assert.match(detail, /Arkiverad" : "Inte arkiverad"/);
  assert.match(detail, /Verifierad owner/);
  assert.doesNotMatch(detail, /tenant\.createdBy|tenant\.updatedBy/);
  assert.doesNotMatch(
    detail,
    /createTenantAction|updateTenantAction|pauseTenantAction|activateTenantAction|archiveTenantAction|restoreTenantAction|badge/i,
  );
});

test("tenant presentation uses Swedish labels and preserves canonical data", () => {
  assert.equal(formatOrganizationNumber("5560160680"), "556016-0680");
  assert.equal(formatOrganizationNumber(null), "Saknas");
  assert.equal(tenantCategoryLabel("customer"), "Kund");
  assert.equal(tenantCategoryLabel("pilot"), "Pilot");
  assert.equal(tenantCategoryLabel("internal"), "Intern");
  assert.equal(tenantStatusLabel("active"), "Aktiv");
  assert.equal(tenantStatusLabel("paused"), "Pausad");
  assert.equal(valueOrMissing(null), "Saknas");
  assert.equal(valueOrMissing("Ada"), "Ada");
  assert.match(
    formatTenantDateTime("2026-07-27T12:00:00.000Z"),
    /27 juli 2026/,
  );
});

test("loading, not-found and error states are generic and accessible", async () => {
  const files = await Promise.all([
    source("../app/tenants/loading.tsx"),
    source("../app/tenants/[tenantId]/loading.tsx"),
    source("../app/tenants/[tenantId]/not-found.tsx"),
    source("../app/tenants/error.tsx"),
  ]);

  assert.match(files[0], /aria-busy="true"/);
  assert.match(files[0], /aria-live="polite"/);
  assert.match(files[1], /aria-busy="true"/);
  assert.match(files[2], /Tenant kunde inte hittas/);
  assert.match(files[2], /href="\/tenants"/);
  assert.match(files[3], /Ett oväntat fel inträffade/);

  for (const file of files) {
    assert.doesNotMatch(
      file,
      /Postgrest|SQL|stack trace|owner UUID|tenant UUID/,
    );
  }
});

test("status text is ordinary text rather than a badge", async () => {
  const statusText = await source("../components/ui/status-text.tsx");
  assert.match(statusText, /export function StatusText/);
  assert.match(statusText, /<span/);
  assert.doesNotMatch(statusText, /badge|rounded-full|pill/i);
});
