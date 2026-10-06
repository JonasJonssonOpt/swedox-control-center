import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatLicenseValidUntil,
  licenseOperations,
  parseLicenseAuditPage,
  parseLicenseTermsPage,
  toStockholmInputValue,
} from "../lib/licenses/license-presentation.ts";
import { stockholmLocalToUtc } from "../lib/server/licenses/license-time.ts";

const LICENSE_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_LICENSE_ID = "20000000-0000-4000-8000-000000000002";
const OWNER_ID = "00000000-0000-4000-8000-000000000051";
const CORRELATION_ID = "50000000-0000-4000-8000-000000000001";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}
function auditEvent(overrides = {}) {
  return {
    actorUserId: OWNER_ID,
    changedFields: ["status", "revision", "updated_at", "updated_by"],
    correlationId: CORRELATION_ID,
    eventType: "license_activated",
    id: "40000000-0000-4000-8000-000000000002",
    licenseId: LICENSE_ID,
    occurredAt: "2026-01-02T00:00:00.000002+00:00",
    revisionAfter: 2,
    revisionBefore: 1,
    ...overrides,
  };
}
const createdEvent = auditEvent({
  changedFields: ["id", "tenant_id", "status", "revision"],
  eventType: "license_created",
  id: "40000000-0000-4000-8000-000000000001",
  occurredAt: "2026-01-02T00:00:00.000001+00:00",
  revisionAfter: 1,
  revisionBefore: null,
});
function termsVersion(version, overrides = {}) {
  return {
    introducedAt: "2026-01-01T00:00:00+00:00",
    introducedAtRevision: version,
    licenseId: LICENSE_ID,
    maxActiveUsers: 24,
    planDisplayLabel: "Mini",
    planKey: "mini",
    planVersion: 1,
    validFrom: "2026-01-01T00:00:00+00:00",
    validUntil: null,
    version,
    ...overrides,
  };
}

test("only state-allowed lifecycle operations are offered, mirroring the database rules", () => {
  assert.deepEqual(licenseOperations("draft", "valid", true), [
    "activate",
    "terminate",
  ]);
  assert.deepEqual(licenseOperations("draft", "not_started", false), [
    "activate",
    "terminate",
  ]);
  assert.deepEqual(licenseOperations("draft", "expired", false), ["terminate"]);
  assert.deepEqual(licenseOperations("active", "valid", false), [
    "renew",
    "suspend",
    "terminate",
  ]);
  assert.deepEqual(licenseOperations("active", "valid", true), [
    "suspend",
    "terminate",
  ]);
  assert.deepEqual(licenseOperations("active", "expired", false), [
    "renew",
    "suspend",
    "terminate",
  ]);
  assert.deepEqual(licenseOperations("suspended", "valid", false), [
    "reactivate",
    "renew",
    "terminate",
  ]);
  assert.deepEqual(licenseOperations("suspended", "expired", false), [
    "renew",
    "terminate",
  ]);
  assert.deepEqual(licenseOperations("suspended", "valid", true), [
    "reactivate",
    "terminate",
  ]);
  for (const validity of ["not_started", "valid", "expired"]) {
    assert.deepEqual(licenseOperations("terminated", validity, false), []);
  }
});

test("validity end and form times are presented in Stockholm time and round-trip exactly", () => {
  assert.equal(formatLicenseValidUntil(null), "Tills vidare");
  assert.notEqual(
    formatLicenseValidUntil("2027-01-01T00:00:00+00:00"),
    "Tills vidare",
  );
  assert.equal(toStockholmInputValue(null), "");
  assert.equal(
    toStockholmInputValue("2026-12-31T23:00:00+00:00"),
    "2027-01-01T00:00",
  );
  assert.equal(
    toStockholmInputValue("2027-06-30T22:00:00+00:00"),
    "2027-07-01T00:00",
  );
  assert.equal(
    toStockholmInputValue("2027-06-30T22:00:30.5+00:00"),
    "2027-07-01T00:00:30",
  );
  for (const instant of [
    "2027-01-15T08:30:00.000Z",
    "2027-07-15T08:30:45.000Z",
  ]) {
    assert.equal(stockholmLocalToUtc(toStockholmInputValue(instant)), instant);
  }
});

test("audit payloads are validated and copied without actor or correlation", () => {
  const page = parseLicenseAuditPage(
    { hasMore: false, items: [auditEvent(), createdEvent], nextCursor: null },
    LICENSE_ID,
  );
  assert.equal(page.items.length, 2);
  for (const item of page.items) {
    assert.equal("actorUserId" in item, false);
    assert.equal("correlationId" in item, false);
  }
  const first = parseLicenseAuditPage(
    {
      hasMore: true,
      items: [auditEvent()],
      nextCursor: { id: auditEvent().id, occurredAt: auditEvent().occurredAt },
    },
    LICENSE_ID,
  );
  assert.deepEqual(first.nextCursor, {
    id: auditEvent().id,
    occurredAt: auditEvent().occurredAt,
  });
  assert.equal(
    parseLicenseAuditPage(
      { hasMore: false, items: [createdEvent], nextCursor: null },
      LICENSE_ID,
      first.items,
    ).items.length,
    1,
  );
  const invalid = [
    [
      {
        hasMore: false,
        items: [auditEvent({ licenseId: OTHER_LICENSE_ID })],
        nextCursor: null,
      },
      [],
    ],
    [
      { hasMore: false, items: [createdEvent, auditEvent()], nextCursor: null },
      [],
    ],
    [{ hasMore: false, items: [auditEvent()], nextCursor: null }, first.items],
    [
      { hasMore: false, items: [auditEvent()], nextCursor: null },
      [createdEvent],
    ],
    [
      {
        hasMore: true,
        items: [auditEvent()],
        nextCursor: {
          id: createdEvent.id,
          occurredAt: createdEvent.occurredAt,
        },
      },
      [],
    ],
    [
      {
        hasMore: false,
        items: [auditEvent()],
        nextCursor: {
          id: auditEvent().id,
          occurredAt: auditEvent().occurredAt,
        },
      },
      [],
    ],
    [
      {
        hasMore: false,
        items: [auditEvent({ changedFields: ["revision", "status"] })],
        nextCursor: null,
      },
      [],
    ],
    [
      {
        hasMore: false,
        items: [auditEvent({ changedFields: ["price"] })],
        nextCursor: null,
      },
      [],
    ],
    [
      {
        hasMore: false,
        items: [auditEvent({ eventType: "license_deleted" })],
        nextCursor: null,
      },
      [],
    ],
    [
      {
        hasMore: false,
        items: [auditEvent({ revisionBefore: null })],
        nextCursor: null,
      },
      [],
    ],
    [{ items: [], nextCursor: null }, []],
  ];
  for (const [payload, existing] of invalid) {
    assert.throws(
      () => parseLicenseAuditPage(payload, LICENSE_ID, existing),
      /invalid_license_page/,
    );
  }
});

test("terms payloads are license-bound and strictly version DESC across appended pages", () => {
  const first = parseLicenseTermsPage(
    {
      hasMore: true,
      items: [termsVersion(3), termsVersion(2)],
      nextCursorVersion: 2,
    },
    LICENSE_ID,
  );
  assert.equal(first.nextCursorVersion, 2);
  assert.equal(
    parseLicenseTermsPage(
      { hasMore: false, items: [termsVersion(1)], nextCursorVersion: null },
      LICENSE_ID,
      first.items,
    ).items[0].version,
    1,
  );
  for (const [payload, existing] of [
    [
      { hasMore: false, items: [termsVersion(2)], nextCursorVersion: null },
      first.items,
    ],
    [
      {
        hasMore: false,
        items: [termsVersion(1), termsVersion(2)],
        nextCursorVersion: null,
      },
      [],
    ],
    [
      {
        hasMore: false,
        items: [termsVersion(1, { licenseId: OTHER_LICENSE_ID })],
        nextCursorVersion: null,
      },
      [],
    ],
    [{ hasMore: true, items: [termsVersion(2)], nextCursorVersion: 1 }, []],
    [
      {
        hasMore: false,
        items: [termsVersion(1, { planKey: "huge" })],
        nextCursorVersion: null,
      },
      [],
    ],
  ]) {
    assert.throws(
      () => parseLicenseTermsPage(payload, LICENSE_ID, existing),
      /invalid_license_page/,
    );
  }
});

test("license list uses URL filters, opaque cursor and a readable stale-cursor reset", async () => {
  const page = await source("app/licenses/page.tsx");
  const list = await source("app/licenses/license-list.tsx");
  assert.match(page, /export const dynamic = "force-dynamic";/);
  assert.match(page, /listLicenses\(parsed\.input\)/);
  assert.match(page, /error\.code !== "validation_error"/);
  assert.match(page, /Listan behöver läsas in från början/);
  assert.match(page, /Läs in första sidan/);
  for (const name of [
    "search",
    "tenantId",
    "status",
    "validity",
    "includeTerminated",
    "cursor",
  ]) {
    assert.match(page, new RegExp(`"${name}"`));
  }
  assert.doesNotMatch(page, /"offset"|offset=|totalCount|pageNumber/i);
  const headings = [...list.matchAll(/^\s+"([^"]+)",$/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(headings, [
    "Tenant",
    "Plan",
    "Administrativ status",
    "Giltighet",
    "Max aktiverade användarkonton",
    "Giltig till",
    "Senast uppdaterad",
  ]);
  assert.match(list, /formatLicenseValidUntil\(license\.validUntil\)/);
  assert.match(list, /<StatusText>\{licenseStatusLabel/);
  assert.match(list, /query\.set\("cursor", cursor\)/);
  assert.match(list, /Nästa sida/);
});

test("detail renders sections, histories keyed on revision and an allowlisted audit copy", async () => {
  const page = await source("app/licenses/[licenseId]/page.tsx");
  const detail = await source("app/licenses/license-detail.tsx");
  assert.match(page, /parseLicenseAuditPage\(page, licenseId\)/);
  assert.match(page, /parseLicenseTermsPage\(page, licenseId\)/);
  assert.match(
    page,
    /key=\{`license-terms-revision-\$\{license\.revision\}`\}/,
  );
  assert.match(
    page,
    /key=\{`license-audit-revision-\$\{license\.revision\}`\}/,
  );
  assert.match(page, /license\.status !== "terminated"/);
  assert.match(page, /notFound\(\)/);
  assert.match(
    detail,
    /key=\{`license-lifecycle-revision-\$\{license\.revision\}`\}/,
  );
  for (const section of ["Licens", "Aktuella villkor", "Metadata"]) {
    assert.match(detail, new RegExp(`title="${section}"`));
  }
  assert.match(detail, /Verifierad owner/);
  assert.match(detail, /formatLicenseValidUntil\(license\.validUntil\)/);
});

test("client components import no server runtime and render no identifiers or badges", async () => {
  const root = new URL("../app/licenses/", import.meta.url);
  const files = (await readdir(root, { recursive: true }))
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => name.replaceAll("\\", "/"));
  assert.ok(files.length >= 15);
  for (const file of files) {
    const text = await readFile(new URL(file, root), "utf8");
    assert.doesNotMatch(text, /badge|rounded-full|pill/i, file);
    assert.doesNotMatch(
      text,
      /actorUserId|correlationId|createdBy|updatedBy/,
      file,
    );
    assert.doesNotMatch(text, /createBrowserClient|supabase\/|\.rpc\(/, file);
    assert.doesNotMatch(text, /<main/, file);
    if (text.startsWith('"use client";')) {
      for (const match of text.matchAll(
        /^import (type )?[^;]*from "@\/lib\/server\/[^"]+";/gm,
      )) {
        assert.equal(match[1], "type ", `${file}: ${match[0]}`);
      }
    }
  }
});

test("forms and dialogs follow the accessible pending, error and stale-data patterns", async () => {
  const form = await source("app/licenses/license-form.tsx");
  const controls = await source("app/licenses/license-lifecycle-controls.tsx");
  const edit = await source("app/licenses/[licenseId]/edit/page.tsx");
  assert.match(form, /useActionState/);
  assert.match(form, /role="alert"/);
  assert.match(form, /aria-invalid=/);
  assert.match(form, /aria-describedby=/);
  assert.match(form, /type="datetime-local"/);
  assert.match(form, /Lämna tomt för Tills vidare/);
  assert.match(form, /Skapar…/);
  assert.match(form, /Sparar…/);
  assert.match(
    form,
    /datesEditable = mode === "create" \|\| initialValues\.status === "draft"/,
  );
  assert.match(form, /Gå tillbaka till detail/);
  assert.doesNotMatch(
    form,
    /name="maxActiveUsers"|name="correlationId"|name="planDisplayLabel"/,
  );
  assert.match(edit, /Avslutad licens kan inte ändras/);
  assert.match(controls, /<dialog/);
  assert.match(controls, /cancelRef\.current\?\.focus\(\)/);
  assert.match(
    controls,
    /onClose=\{\(\) => triggerRef\.current\?\.focus\(\)\}/,
  );
  assert.match(
    controls,
    /licenseOperations\(status, validity, validUntil === null\)/,
  );
  assert.match(controls, /name="openEnded"/);
  assert.match(controls, /ladda om detail/);
  for (const verb of [
    "Aktiverar…",
    "Återaktiverar…",
    "Förnyar…",
    "Spärrar…",
    "Avslutar…",
  ]) {
    assert.match(controls, new RegExp(verb));
  }
});
