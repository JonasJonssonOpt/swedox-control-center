import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatInstallationAuditDateTime,
  formatInstallationAuditRevision,
  INSTALLATION_AUDIT_EVENT_LABELS,
  INSTALLATION_AUDIT_FIELD_LABELS,
  parseInstallationAuditPage,
} from "../lib/installations/installation-audit-presentation.ts";

const INSTALLATION_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_INSTALLATION_ID = "00000000-0000-4000-8000-000000000102";
const EVENT_ID = "00000000-0000-4000-8000-000000000201";
const NEXT_EVENT_ID = "00000000-0000-4000-8000-000000000200";
const OCCURRED_AT = "2026-07-29T12:00:00.000Z";
const EARLIER_AT = "2026-07-29T11:00:00.000Z";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function item(overrides = {}) {
  return {
    actorUserId: "00000000-0000-4000-8000-000000000001",
    changedFields: ["display_name"],
    correlationId: "00000000-0000-4000-8000-000000000301",
    eventType: "installation_edited",
    id: EVENT_ID,
    installationId: INSTALLATION_ID,
    occurredAt: OCCURRED_AT,
    revisionAfter: 2,
    revisionBefore: 1,
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

test("installation audit labels cover all events and the exact 17 fields", () => {
  assert.deepEqual(INSTALLATION_AUDIT_EVENT_LABELS, {
    installation_activated: "Installation aktiverad",
    installation_archived: "Installation arkiverad",
    installation_created: "Installation skapad",
    installation_decommissioned: "Installation avvecklad",
    installation_edited: "Installation ändrad",
    installation_paused: "Installation pausad",
    installation_restored: "Installation återställd",
  });
  assert.deepEqual(Object.keys(INSTALLATION_AUDIT_FIELD_LABELS), [
    "id",
    "tenant_id",
    "installation_code",
    "display_name",
    "environment",
    "administrative_status",
    "application_url",
    "supabase_project_ref",
    "hosting_region",
    "administrative_note",
    "revision",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by",
    "archived_at",
    "archived_by",
  ]);
  assert.equal(INSTALLATION_AUDIT_FIELD_LABELS.id, "Installation-ID");
  assert.equal(
    INSTALLATION_AUDIT_FIELD_LABELS.supabase_project_ref,
    "Supabase project ref",
  );
});

test("presentation formats Stockholm time and locked revision forms", () => {
  assert.match(formatInstallationAuditDateTime(OCCURRED_AT), /29 juli 2026/);
  assert.equal(formatInstallationAuditRevision(null, 1), "Revision 1");
  assert.equal(formatInstallationAuditRevision(3, 4), "Revision 3 → 4");
});

test("parser accepts initial and continuing pages while minimizing metadata", () => {
  const initial = parseInstallationAuditPage(
    page({
      hasMore: true,
      nextCursor: { id: EVENT_ID, occurredAt: OCCURRED_AT },
    }),
    INSTALLATION_ID,
  );
  assert.equal(initial.hasMore, true);
  assert.equal("actorUserId" in initial.items[0], false);
  assert.equal("correlationId" in initial.items[0], false);

  const final = parseInstallationAuditPage(
    page({
      items: [
        item({
          changedFields: ["id", "tenant_id", "revision"],
          eventType: "installation_created",
          id: NEXT_EVENT_ID,
          occurredAt: EARLIER_AT,
          revisionAfter: 1,
          revisionBefore: null,
        }),
      ],
    }),
    INSTALLATION_ID,
    initial.items,
  );
  assert.equal(final.hasMore, false);
  assert.equal(final.nextCursor, null);
});

test("parser accepts empty history and rejects partial cursors", () => {
  assert.deepEqual(
    parseInstallationAuditPage(
      { hasMore: false, items: [], nextCursor: null },
      INSTALLATION_ID,
    ),
    { hasMore: false, items: [], nextCursor: null },
  );
  assert.throws(() =>
    parseInstallationAuditPage(
      page({
        hasMore: true,
        nextCursor: { id: EVENT_ID },
      }),
      INSTALLATION_ID,
    ),
  );
});

test("parser rejects cross-installation, duplicates and unstable order", () => {
  const existing = parseInstallationAuditPage(page(), INSTALLATION_ID).items;
  assert.throws(() =>
    parseInstallationAuditPage(
      page({ items: [item({ installationId: OTHER_INSTALLATION_ID })] }),
      INSTALLATION_ID,
    ),
  );
  assert.throws(() =>
    parseInstallationAuditPage(
      page({ items: [item(), item()] }),
      INSTALLATION_ID,
    ),
  );
  assert.throws(() =>
    parseInstallationAuditPage(page(), INSTALLATION_ID, existing),
  );
  assert.throws(() =>
    parseInstallationAuditPage(
      page({
        items: [
          item(),
          item({
            id: NEXT_EVENT_ID,
            occurredAt: "2026-07-29T13:00:00.000Z",
          }),
        ],
      }),
      INSTALLATION_ID,
    ),
  );
});

test("parser rejects unknown events, fields, revisions and timestamps", () => {
  const invalidItems = [
    item({ eventType: "installation_provisioned" }),
    item({ changedFields: ["provider_status"] }),
    item({ changedFields: ["revision", "display_name"] }),
    item({ revisionAfter: 4, revisionBefore: 1 }),
    item({
      eventType: "installation_created",
      revisionAfter: 2,
      revisionBefore: null,
    }),
    item({ occurredAt: "not-a-timestamp" }),
  ];
  for (const invalid of invalidItems)
    assert.throws(() =>
      parseInstallationAuditPage(page({ items: [invalid] }), INSTALLATION_ID),
    );
});

test("client history uses only the audit route with a synchronous request lock", async () => {
  const history = await source(
    "../app/installations/[installationId]/installation-audit-history.tsx",
  );
  assert.match(history, /^"use client";/);
  assert.match(
    history,
    /\/api\/installations\/\$\{encodeURIComponent\(installationId\)\}\/audit/,
  );
  assert.match(history, /pageSize: String\(PAGE_SIZE\)/);
  assert.match(history, /cursorId: nextCursor\.id/);
  assert.match(history, /cursorOccurredAt: nextCursor\.occurredAt/);
  assert.match(
    history,
    /if \(requestPending\.current \|\| !hasMore \|\| nextCursor === null\)/,
  );
  assert.match(history, /requestPending\.current = true/);
  assert.match(history, /disabled=\{isPending\}/);
  assert.match(history, /aria-disabled=\{isPending\}/);
  assert.match(
    history,
    /setEvents\(\(current\) => \[\.\.\.current, \.\.\.page\.items\]\)/,
  );
  assert.doesNotMatch(
    history,
    /supabase|repository|service_role|\.from\(|\.rpc\(|mutation|infinite|poll|realtime/i,
  );
});

test("history is accessible, metadata-only and masks local errors", async () => {
  const history = await source(
    "../app/installations/[installationId]/installation-audit-history.tsx",
  );
  for (const text of [
    "Händelsehistorik",
    "Verifierad owner",
    "Ändrade fält",
    "Det finns inga registrerade händelser",
    "Ladda fler",
    "Laddar…",
  ])
    assert.match(history, new RegExp(text));
  assert.match(history, /<section/);
  assert.match(history, /<h2/);
  assert.match(history, /<ol aria-label="Händelser, nyast först">/);
  assert.match(history, /<time/);
  assert.match(history, /dateTime=\{event\.occurredAt\}/);
  assert.match(history, /role="alert"/);
  assert.match(history, /aria-live="polite"/);
  assert.match(history, /focus-visible:/);
  assert.match(history, /key=\{event\.id\}/);
  assert.doesNotMatch(
    history,
    /(?:id|data-[\w-]+|aria-label)=\{event\.id\}|actorUserId|correlationId|badge|gamla värden|nya värden/i,
  );
});

test("detail loads 25 events directly from service and renders archived history", async () => {
  const detailPage = await source(
    "../app/installations/[installationId]/page.tsx",
  );
  assert.match(detailPage, /await listInstallationAuditEvents\(/);
  assert.match(detailPage, /installationId, pageSize: 25/);
  assert.match(detailPage, /parseInstallationAuditPage/);
  assert.match(detailPage, /InstallationAuditHistory/);
  assert.match(detailPage, /initialPage=\{auditPage\}/);
  assert.doesNotMatch(
    detailPage,
    /fetch\(|supabase|repository|service_role|\.from\(|\.rpc\(/i,
  );
  assert.match(
    detailPage,
    /<InstallationDetail installation=\{installation\} \/>[\s\S]*<InstallationAuditHistory/,
  );
  assert.doesNotMatch(
    detailPage,
    /installation\.archivedAt[^?]*\?\s*\(\s*<InstallationAuditHistory/,
  );
});
