export const INSTALLATION_AUDIT_EVENT_LABELS = Object.freeze({
  installation_activated: "Installation aktiverad",
  installation_archived: "Installation arkiverad",
  installation_created: "Installation skapad",
  installation_decommissioned: "Installation avvecklad",
  installation_edited: "Installation ändrad",
  installation_paused: "Installation pausad",
  installation_restored: "Installation återställd",
});

export const INSTALLATION_AUDIT_FIELD_LABELS = Object.freeze({
  id: "Installation-ID",
  tenant_id: "Tenant",
  installation_code: "Installationskod",
  display_name: "Visningsnamn",
  environment: "Environment",
  administrative_status: "Administrativ status",
  application_url: "Application URL",
  supabase_project_ref: "Supabase project ref",
  hosting_region: "Hosting region",
  administrative_note: "Administrativ notering",
  revision: "Revision",
  created_at: "Skapad tid",
  created_by: "Skapad av",
  updated_at: "Uppdaterad tid",
  updated_by: "Uppdaterad av",
  archived_at: "Arkiverad tid",
  archived_by: "Arkiverad av",
});

const CHANGED_FIELD_ORDER = Object.freeze(
  Object.keys(INSTALLATION_AUDIT_FIELD_LABELS),
);
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InstallationAuditEventCode =
  keyof typeof INSTALLATION_AUDIT_EVENT_LABELS;
export type InstallationAuditFieldCode =
  keyof typeof INSTALLATION_AUDIT_FIELD_LABELS;
export type InstallationAuditListItem = Readonly<{
  changedFields: readonly InstallationAuditFieldCode[];
  eventType: InstallationAuditEventCode;
  id: string;
  installationId: string;
  occurredAt: string;
  revisionAfter: number;
  revisionBefore: number | null;
}>;
export type InstallationAuditPagePayload = Readonly<{
  hasMore: boolean;
  items: readonly InstallationAuditListItem[];
  nextCursor: Readonly<{ id: string; occurredAt: string }> | null;
}>;

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

function isEventType(value: unknown): value is InstallationAuditEventCode {
  return (
    typeof value === "string" &&
    Object.hasOwn(INSTALLATION_AUDIT_EVENT_LABELS, value)
  );
}

function isChangedFields(
  value: unknown,
): value is readonly InstallationAuditFieldCode[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const indexes = value.map((field) =>
    typeof field === "string" ? CHANGED_FIELD_ORDER.indexOf(field) : -1,
  );
  return (
    indexes.every((index) => index >= 0) &&
    new Set(indexes).size === indexes.length &&
    indexes.every(
      (index, position) => position === 0 || index > indexes[position - 1],
    )
  );
}

function parseItem(
  value: unknown,
  installationId: string,
): InstallationAuditListItem {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    value.installationId !== installationId ||
    !isEventType(value.eventType) ||
    !isTimestamp(value.occurredAt) ||
    !isPositiveRevision(value.revisionAfter) ||
    (value.revisionBefore !== null &&
      !isPositiveRevision(value.revisionBefore)) ||
    (value.revisionBefore === null
      ? value.eventType !== "installation_created" || value.revisionAfter !== 1
      : value.revisionAfter !== value.revisionBefore + 1) ||
    !isChangedFields(value.changedFields)
  ) {
    throw new Error("invalid_audit_page");
  }

  return Object.freeze({
    changedFields: Object.freeze([...value.changedFields]),
    eventType: value.eventType,
    id: value.id,
    installationId,
    occurredAt: value.occurredAt,
    revisionAfter: value.revisionAfter,
    revisionBefore: value.revisionBefore,
  });
}

export function parseInstallationAuditPage(
  value: unknown,
  installationId: string,
  existingItems: readonly InstallationAuditListItem[] = [],
): InstallationAuditPagePayload {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("invalid_audit_page");
  }

  const items = value.items.map((item) => parseItem(item, installationId));
  const ids = new Set(existingItems.map((item) => item.id));
  for (const item of items) {
    if (ids.has(item.id)) throw new Error("invalid_audit_page");
    ids.add(item.id);
  }

  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (
      previous.occurredAt < current.occurredAt ||
      (previous.occurredAt === current.occurredAt && previous.id <= current.id)
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
        precedingItem.id <= firstItem.id))
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

export function formatInstallationAuditDateTime(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

export function formatInstallationAuditRevision(
  revisionBefore: number | null,
  revisionAfter: number,
): string {
  return revisionBefore === null
    ? `Revision ${revisionAfter}`
    : `Revision ${revisionBefore} → ${revisionAfter}`;
}
