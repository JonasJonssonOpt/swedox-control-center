export const TENANT_AUDIT_EVENT_LABELS = Object.freeze({
  tenant_activated: "Tenant aktiverad",
  tenant_archived: "Tenant arkiverad",
  tenant_created: "Tenant skapad",
  tenant_edited: "Tenant uppdaterad",
  tenant_paused: "Tenant pausad",
  tenant_restored: "Tenant återställd",
});

export const TENANT_AUDIT_FIELD_LABELS = Object.freeze({
  administrative_note: "Administrativ notering",
  archived_at: "Arkiveringsstatus",
  archived_by: "Arkiverad av",
  category: "Kategori",
  contact_email: "E-post",
  contact_name: "Kontaktperson",
  contact_phone: "Telefon",
  country_code: "Land",
  created_at: "Skapad tidpunkt",
  created_by: "Skapad av",
  id: "Tenantidentitet",
  legal_name: "Juridiskt namn",
  operational_status: "Operativ status",
  organization_number: "Organisationsnummer",
  revision: "Revision",
  updated_at: "Uppdaterad tidpunkt",
  updated_by: "Uppdaterad av",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});

export type TenantAuditEventCode = keyof typeof TENANT_AUDIT_EVENT_LABELS;
export type TenantAuditFieldCode = keyof typeof TENANT_AUDIT_FIELD_LABELS;

export type TenantAuditListItem = Readonly<{
  changedFields: readonly TenantAuditFieldCode[];
  eventType: TenantAuditEventCode;
  id: string;
  occurredAt: string;
  revisionAfter: number;
  revisionBefore: number | null;
  tenantId: string;
}>;

export type TenantAuditPagePayload = Readonly<{
  hasMore: boolean;
  items: readonly TenantAuditListItem[];
  nextCursor: Readonly<{ id: string; occurredAt: string }> | null;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isPositiveRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isEventType(value: unknown): value is TenantAuditEventCode {
  return (
    typeof value === "string" && Object.hasOwn(TENANT_AUDIT_EVENT_LABELS, value)
  );
}

function isChangedFields(
  value: unknown,
): value is readonly TenantAuditFieldCode[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (field) =>
        typeof field === "string" &&
        Object.hasOwn(TENANT_AUDIT_FIELD_LABELS, field),
    ) &&
    new Set(value).size === value.length &&
    [...value].sort().join("\0") === value.join("\0")
  );
}

function parseItem(value: unknown, tenantId: string): TenantAuditListItem {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    value.tenantId !== tenantId ||
    !isEventType(value.eventType) ||
    !isTimestamp(value.occurredAt) ||
    !isPositiveRevision(value.revisionAfter) ||
    (value.revisionBefore !== null &&
      !isPositiveRevision(value.revisionBefore)) ||
    !isChangedFields(value.changedFields)
  ) {
    throw new Error("invalid_audit_page");
  }

  return Object.freeze({
    changedFields: Object.freeze([...value.changedFields]),
    eventType: value.eventType,
    id: value.id,
    occurredAt: value.occurredAt,
    revisionAfter: value.revisionAfter,
    revisionBefore: value.revisionBefore,
    tenantId,
  });
}

export function parseTenantAuditPage(
  value: unknown,
  tenantId: string,
  existingItems: readonly TenantAuditListItem[] = [],
): TenantAuditPagePayload {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("invalid_audit_page");
  }

  const items = value.items.map((item) => parseItem(item, tenantId));
  const ids = new Set(existingItems.map((item) => item.id));
  for (const item of items) {
    if (ids.has(item.id)) {
      throw new Error("invalid_audit_page");
    }
    ids.add(item.id);
  }

  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (
      previous.occurredAt < current.occurredAt ||
      (previous.occurredAt === current.occurredAt &&
        previous.id.localeCompare(current.id) <= 0)
    ) {
      throw new Error("invalid_audit_page");
    }
  }

  const precedingItem = existingItems.at(-1);
  const firstItem = items.at(0);
  if (
    precedingItem !== undefined &&
    firstItem !== undefined &&
    (precedingItem.occurredAt < firstItem.occurredAt ||
      (precedingItem.occurredAt === firstItem.occurredAt &&
        precedingItem.id.localeCompare(firstItem.id) <= 0))
  ) {
    throw new Error("invalid_audit_page");
  }

  const cursor = value.nextCursor;
  const cursorIsValid =
    isRecord(cursor) &&
    isUuid(cursor.id) &&
    isTimestamp(cursor.occurredAt) &&
    items.at(-1)?.id === cursor.id &&
    items.at(-1)?.occurredAt === cursor.occurredAt;

  if (
    typeof value.hasMore !== "boolean" ||
    (value.hasMore && !cursorIsValid) ||
    (!value.hasMore && cursor !== null)
  ) {
    throw new Error("invalid_audit_page");
  }

  return Object.freeze({
    hasMore: value.hasMore,
    items: Object.freeze(items),
    nextCursor: value.hasMore
      ? Object.freeze({
          id: (cursor as Record<string, unknown>).id as string,
          occurredAt: (cursor as Record<string, unknown>).occurredAt as string,
        })
      : null,
  });
}

export function formatTenantAuditDateTime(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

export function formatTenantAuditRevision(
  revisionBefore: number | null,
  revisionAfter: number,
): string {
  return revisionBefore === null
    ? `Revision ${revisionAfter}`
    : `Revision ${revisionBefore} → ${revisionAfter}`;
}
