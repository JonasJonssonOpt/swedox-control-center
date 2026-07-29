import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatInstallationDateTime,
  installationEnvironmentLabel,
  installationStatusLabel,
  installationValueOrMissing,
} from "../lib/server/installations/installation-presentation.ts";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("installation UI exposes list, detail, create and edit as dynamic server pages", async () => {
  const entries = await readdir(
    new URL("../app/installations", import.meta.url),
    { recursive: true },
  );
  const pages = entries
    .filter((entry) => /(?:^|[\\/])page\.tsx$/.test(entry))
    .sort();
  assert.deepEqual(pages, [
    "[installationId]\\edit\\page.tsx",
    "[installationId]\\page.tsx",
    "new\\page.tsx",
    "page.tsx",
  ]);

  const list = await source("../app/installations/page.tsx");
  const detail = await source("../app/installations/[installationId]/page.tsx");
  const create = await source("../app/installations/new/page.tsx");
  const edit = await source(
    "../app/installations/[installationId]/edit/page.tsx",
  );
  for (const page of [list, detail, create, edit]) {
    assert.match(page, /dynamic = "force-dynamic"/);
    assert.match(page, /revalidate = 0/);
    assert.doesNotMatch(
      page,
      /"use client"|fetch\(|\/api\/installations|repository|createBrowserClient|service[_ -]?role|\.from\(|\.rpc\(/i,
    );
  }
  for (const page of [list, detail, edit])
    assert.match(page, /@\/lib\/server\/installations/);
  assert.match(create, /@\/lib\/server\/tenants/);
  assert.match(list, /listInstallations\(parsed\.input\)/);
  assert.match(list, /listTenants\(\)/);
  assert.match(detail, /getInstallationById\(installationId\)/);
});

test("installation list renders the exact semantic compact columns and safe DTO fields", async () => {
  const list = await source("../app/installations/installation-list.tsx");
  for (const heading of [
    "Installation",
    "Tenant",
    "Environment",
    "Administrativ status",
    "Region",
    "Application host",
    "Uppdaterad",
  ])
    assert.match(list, new RegExp(`"${heading}"`));

  assert.match(list, /<table/);
  assert.match(list, /scope="col"/);
  assert.match(list, /scope="row"/);
  assert.match(list, /href=\{`\/installations\/\$\{installation\.id\}`\}/);
  assert.match(list, /installation\.installationCode/);
  assert.match(list, /<StatusText>/);
  assert.match(
    list,
    /installationValueOrMissing\(installation\.hostingRegion\)/,
  );
  assert.match(
    list,
    /installationValueOrMissing\(installation\.applicationHost\)/,
  );
  assert.doesNotMatch(
    list,
    /applicationUrl|supabaseProjectRef|administrativeNote|installation\.revision|createdBy|updatedBy|badge/i,
  );
});

test("filter form is native GET, URL-bound and explains the exact search scope", async () => {
  const filters = await source("../app/installations/installation-filters.tsx");
  assert.match(filters, /action="\/installations"/);
  assert.match(filters, /method="get"/);
  for (const name of [
    "search",
    "tenantId",
    "environment",
    "administrativeStatus",
    "includeArchived",
  ])
    assert.match(filters, new RegExp(`name="${name}"`));
  assert.match(
    filters,
    /Söker endast i installationsnamn och installationskod/,
  );
  assert.match(filters, /tenants\.map/);
  assert.match(filters, /href="\/installations"/);
  assert.match(filters, /focus-visible:outline-2/);
  assert.doesNotMatch(
    filters,
    /\b(?:sort|badge|chip)\b|name="offset"|"use client"/i,
  );
});

test("list query parsing locks cursor pairs and preserves URL filter state", async () => {
  const page = await source("../app/installations/page.tsx");
  for (const parameter of [
    "search",
    "tenantId",
    "environment",
    "administrativeStatus",
    "includeArchived",
    "cursorDisplayName",
    "cursorId",
  ])
    assert.match(page, new RegExp(`"${parameter}"`));
  assert.match(
    page,
    /\(cursorDisplayName === undefined\) !== \(cursorId === undefined\)/,
  );
  assert.doesNotMatch(page, /"(?:pageSize|offset|sort|totalCount)"/);

  const list = await source("../app/installations/installation-list.tsx");
  for (const parameter of [
    "search",
    "tenantId",
    "environment",
    "administrativeStatus",
    "includeArchived",
    "cursorDisplayName",
    "cursorId",
  ])
    assert.match(list, new RegExp(`"${parameter}"`));
  assert.match(list, /page\.nextCursor/);
  assert.match(list, /Nästa sida/);
  assert.doesNotMatch(
    list,
    /Föregående|page number|sidnummer|query\.set\("offset"|totalCount/i,
  );
});

test("list distinguishes empty module and filtered empty state", async () => {
  const list = await source("../app/installations/installation-list.tsx");
  assert.match(list, /page\.items\.length === 0/);
  assert.match(list, /Inga installationer är registrerade/);
  assert.match(list, /Inga installationer matchar valda filter/);
  assert.match(list, /Återställ filter/);
  const page = await source("../app/installations/page.tsx");
  assert.match(page, /href="\/installations\/new"/);
  assert.match(page, /Skapa installation/);
  assert.doesNotMatch(list, /createInstallationAction/);
});

test("detail contains all locked sections and detail-only protected metadata", async () => {
  const detail = await source("../app/installations/installation-detail.tsx");
  for (const value of [
    "Identitet",
    "Display name",
    "Installation code",
    "Environment",
    "Tenant",
    "Administrativ status",
    "Arkiveringsstatus",
    "Teknisk metadata",
    "Application URL",
    "Supabase project ref",
    "Hosting region",
    "Administration",
    "Administrativ notering",
    "Metadata",
    "Revision",
    "Skapad",
    "Senast uppdaterad",
    "Arkiverad",
  ])
    assert.match(detail, new RegExp(value));
  assert.match(detail, /installation\.applicationUrl/);
  assert.match(detail, /installation\.supabaseProjectRef/);
  assert.match(detail, /installation\.administrativeNote/);
  assert.match(detail, /whitespace-pre-wrap/);
  assert.doesNotMatch(detail, /dangerouslySetInnerHTML|href=.*applicationUrl/);
  assert.doesNotMatch(
    detail,
    /createdBy|updatedBy|archivedBy|actorUserId|correlationId|contactEmail|contactName/,
  );
});

test("archived detail is explicit and readable without audit UI", async () => {
  const detail = await source("../app/installations/installation-detail.tsx");
  assert.match(detail, /Denna installation är arkiverad/);
  assert.match(detail, /visas inte i standardlistan/);
  assert.match(detail, /"Inte arkiverad"\s*:\s*"Arkiverad"/);
  assert.match(detail, /InstallationLifecycleControls/);
  assert.doesNotMatch(detail, /Händelsehistorik|badge/i);
});

test("detail page has breadcrumb, stable not-found mapping and conditional edit link", async () => {
  const page = await source("../app/installations/[installationId]/page.tsx");
  assert.match(page, /aria-label="Brödsmulor"/);
  assert.match(page, /href="\/installations"/);
  assert.match(page, /unstable_rethrow\(error\)/);
  assert.match(page, /error\.code === "not_found"/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /installation\.archivedAt === null/);
  assert.match(
    page,
    /href=\{`\/installations\/\$\{installation\.id\}\/edit`\}/,
  );
  assert.match(page, /Redigera/);
  assert.doesNotMatch(page, /\/audit|lifecycle|InstallationAction/);
});

test("loading, not-found and error states are accessible and mask identifiers", async () => {
  const files = await Promise.all([
    source("../app/installations/loading.tsx"),
    source("../app/installations/[installationId]/loading.tsx"),
    source("../app/installations/[installationId]/not-found.tsx"),
    source("../app/installations/error.tsx"),
  ]);
  assert.match(files[0], /aria-busy="true"/);
  assert.match(files[0], /aria-live="polite"/);
  assert.match(files[1], /aria-busy="true"/);
  assert.match(files[1], /aria-live="polite"/);
  assert.match(files[2], /Installationen kunde inte hittas/);
  assert.match(files[3], /Ett oväntat fel inträffade/);
  for (const file of files)
    assert.doesNotMatch(
      file,
      /installationId|tenantId|project ref|application URL|PostgREST|SQL|stack|correlation/i,
    );
});

test("presentation helpers provide Swedish labels, Stockholm time and explicit nulls", () => {
  assert.equal(installationEnvironmentLabel("production"), "Produktion");
  assert.equal(installationEnvironmentLabel("staging"), "Staging");
  assert.equal(installationEnvironmentLabel("test"), "Test");
  assert.equal(installationEnvironmentLabel("development"), "Utveckling");
  assert.equal(installationStatusLabel("planned"), "Planerad");
  assert.equal(installationStatusLabel("active"), "Aktiv");
  assert.equal(installationStatusLabel("paused"), "Pausad");
  assert.equal(installationStatusLabel("decommissioned"), "Avvecklad");
  assert.equal(installationValueOrMissing(null), "Saknas");
  assert.equal(installationValueOrMissing("eu-north-1"), "eu-north-1");
  assert.match(
    formatInstallationDateTime("2026-07-29T12:00:00.000Z"),
    /29 juli 2026/,
  );
});
