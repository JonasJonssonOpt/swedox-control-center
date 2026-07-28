import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatTenantAuditDateTime,
  formatTenantAuditRevision,
  parseTenantAuditPage,
  TENANT_AUDIT_EVENT_LABELS,
  TENANT_AUDIT_FIELD_LABELS,
} from "../lib/tenants/tenant-audit-presentation.ts";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_TENANT_ID = "00000000-0000-4000-8000-000000000102";
const EVENT_ID = "00000000-0000-4000-8000-000000000201";
const NEXT_EVENT_ID = "00000000-0000-4000-8000-000000000200";
const OCCURRED_AT = "2026-07-27T12:00:00.000Z";
const EARLIER_AT = "2026-07-27T11:00:00.000Z";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function item(overrides = {}) {
  return {
    actorUserId: "00000000-0000-4000-8000-000000000001",
    changedFields: ["legal_name"],
    correlationId: "00000000-0000-4000-8000-000000000301",
    eventType: "tenant_edited",
    id: EVENT_ID,
    occurredAt: OCCURRED_AT,
    revisionAfter: 2,
    revisionBefore: 1,
    tenantId: TENANT_ID,
    ...overrides,
  };
}

function page(overrides = {}) {
  return {
    hasMore: false,
    items: [item()],
    nextCursor: null,
    ...overrides,
  };
}

test("audit labels cover all locked events and the exact changed-field allowlist", () => {
  assert.deepEqual(TENANT_AUDIT_EVENT_LABELS, {
    tenant_activated: "Tenant aktiverad",
    tenant_archived: "Tenant arkiverad",
    tenant_created: "Tenant skapad",
    tenant_edited: "Tenant uppdaterad",
    tenant_paused: "Tenant pausad",
    tenant_restored: "Tenant återställd",
  });
  assert.deepEqual(Object.keys(TENANT_AUDIT_FIELD_LABELS).sort(), [
    "administrative_note",
    "archived_at",
    "archived_by",
    "category",
    "contact_email",
    "contact_name",
    "contact_phone",
    "country_code",
    "created_at",
    "created_by",
    "id",
    "legal_name",
    "operational_status",
    "organization_number",
    "revision",
    "updated_at",
    "updated_by",
  ]);
  assert.equal(
    TENANT_AUDIT_FIELD_LABELS.administrative_note,
    "Administrativ notering",
  );
  assert.equal(
    TENANT_AUDIT_FIELD_LABELS.organization_number,
    "Organisationsnummer",
  );
});

test("audit presentation formats Swedish time and revisions without raw null", () => {
  assert.match(formatTenantAuditDateTime(OCCURRED_AT), /27 juli 2026/);
  assert.equal(formatTenantAuditRevision(null, 1), "Revision 1");
  assert.equal(formatTenantAuditRevision(3, 4), "Revision 3 → 4");
});

test("audit page parser accepts initial, continuing and final pages", () => {
  const initial = parseTenantAuditPage(
    page({
      hasMore: true,
      nextCursor: { id: EVENT_ID, occurredAt: OCCURRED_AT },
    }),
    TENANT_ID,
  );
  assert.equal(initial.hasMore, true);
  assert.deepEqual(initial.nextCursor, {
    id: EVENT_ID,
    occurredAt: OCCURRED_AT,
  });
  assert.equal("actorUserId" in initial.items[0], false);
  assert.equal("correlationId" in initial.items[0], false);

  const final = parseTenantAuditPage(
    page({
      items: [
        item({
          id: NEXT_EVENT_ID,
          occurredAt: EARLIER_AT,
          revisionAfter: 1,
          revisionBefore: null,
        }),
      ],
    }),
    TENANT_ID,
    initial.items,
  );
  assert.equal(final.hasMore, false);
  assert.equal(final.nextCursor, null);
});

test("audit page parser accepts an empty history", () => {
  assert.deepEqual(
    parseTenantAuditPage(
      { hasMore: false, items: [], nextCursor: null },
      TENANT_ID,
    ),
    { hasMore: false, items: [], nextCursor: null },
  );
});

test("audit page parser rejects malformed, cross-tenant, duplicate and unstable pages", () => {
  const existing = parseTenantAuditPage(page(), TENANT_ID).items;
  const invalidPages = [
    null,
    { hasMore: true, items: [item()], nextCursor: null },
    page({ items: [item({ tenantId: OTHER_TENANT_ID })] }),
    page({ items: [item({ changedFields: ["legal_name", "category"] })] }),
    page({ items: [item(), item()] }),
  ];
  for (const invalid of invalidPages) {
    assert.throws(() => parseTenantAuditPage(invalid, TENANT_ID));
  }
  assert.throws(() => parseTenantAuditPage(page(), TENANT_ID, existing));
  assert.throws(() =>
    parseTenantAuditPage(
      page({
        items: [
          item({
            id: NEXT_EVENT_ID,
            occurredAt: "2026-07-27T13:00:00.000Z",
          }),
        ],
      }),
      TENANT_ID,
      existing,
    ),
  );
});

test("audit UI is a minimal API-only client boundary with guarded pagination", async () => {
  const history = await source(
    "../app/tenants/[tenantId]/tenant-audit-history.tsx",
  );
  assert.match(history, /^"use client";/);
  assert.match(
    history,
    /\/api\/tenants\/\$\{encodeURIComponent\(tenantId\)\}\/audit/,
  );
  assert.match(history, /pageSize: String\(PAGE_SIZE\)/);
  assert.match(history, /cursorId: nextCursor\.id/);
  assert.match(history, /cursorOccurredAt: nextCursor\.occurredAt/);
  assert.match(history, /requestPending\.current/);
  assert.match(history, /disabled=\{isPending\}/);
  assert.match(
    history,
    /setEvents\(\(current\) => \[\.\.\.current, \.\.\.page\.items\]\)/,
  );
  assert.doesNotMatch(
    history,
    /supabase|repository|service_role|\.from\(|\.rpc\(|mutation|totalCount/i,
  );
});

test("audit UI renders accessible metadata-only states without identifiers or badges", async () => {
  const history = await source(
    "../app/tenants/[tenantId]/tenant-audit-history.tsx",
  );
  for (const text of [
    "Händelsehistorik",
    "Verifierad owner",
    "Ändrade fält",
    "Det finns inga registrerade händelser",
    "Ladda fler",
    "Laddar…",
  ]) {
    assert.match(history, new RegExp(text));
  }
  assert.match(history, /<ol aria-label="Händelser, nyast först">/);
  assert.match(history, /<time/);
  assert.match(history, /dateTime=\{event\.occurredAt\}/);
  assert.match(history, /role="alert"/);
  assert.match(history, /aria-live="polite"/);
  assert.match(history, /focus-visible:/);
  assert.doesNotMatch(
    history,
    /actorUserId|correlationId|audit-event-\$\{|badge|gamla värden|nya värden/i,
  );
});

test("audit architecture uses direct service initially and no database access", async () => {
  const pageSource = await source("../app/tenants/[tenantId]/page.tsx");
  assert.match(pageSource, /await listTenantAuditEvents\(/);
  assert.match(pageSource, /pageSize: 25/);
  assert.match(pageSource, /TenantAuditHistory/);
  assert.doesNotMatch(
    pageSource,
    /fetch\(|supabase|repository|service_role|\.from\(|\.rpc\(/i,
  );
});
