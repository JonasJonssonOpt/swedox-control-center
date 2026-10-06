// Client-safe Licensing presentation: Swedish labels, Europe/Stockholm time
// and validation of paginated history payloads before they are appended.
// Never renders actor UUIDs, correlation IDs or field values.

export const LICENSE_STATUS_LABELS = Object.freeze({
  active: "Aktiv",
  draft: "Utkast",
  suspended: "Spärrad",
  terminated: "Avslutad",
});
export const LICENSE_VALIDITY_LABELS = Object.freeze({
  expired: "Utgången",
  not_started: "Ej påbörjad",
  valid: "Giltig",
});
export const LICENSE_PLAN_OPTIONS = Object.freeze([
  Object.freeze({ key: "mini", label: "Mini", maxActiveUsers: 24 }),
  Object.freeze({ key: "standard", label: "Standard", maxActiveUsers: 49 }),
  Object.freeze({ key: "stor", label: "Stor", maxActiveUsers: 100 }),
]);
export const LICENSE_AUDIT_EVENT_LABELS = Object.freeze({
  license_activated: "Licens aktiverad",
  license_created: "Licens skapad",
  license_renewed: "Licens förnyad",
  license_suspended: "Licens spärrad",
  license_terminated: "Licens avslutad",
  license_terms_changed: "Villkor ändrade",
});
export const LICENSE_AUDIT_FIELD_LABELS = Object.freeze({
  id: "Licens-ID",
  tenant_id: "Tenant",
  status: "Administrativ status",
  revision: "Revision",
  current_terms_version: "Villkorsversion",
  plan_key: "Paket",
  plan_version: "Paketversion",
  plan_display_label: "Paketnamn",
  max_active_users: "Max aktiverade användarkonton",
  valid_from: "Giltig från",
  valid_until: "Giltig till",
  created_at: "Skapad tid",
  created_by: "Skapad av",
  updated_at: "Uppdaterad tid",
  updated_by: "Uppdaterad av",
});

export type LicenseStatusCode = keyof typeof LICENSE_STATUS_LABELS;
export type LicenseValidityCode = keyof typeof LICENSE_VALIDITY_LABELS;
export type LicenseAuditEventCode = keyof typeof LICENSE_AUDIT_EVENT_LABELS;
export type LicenseAuditFieldCode = keyof typeof LICENSE_AUDIT_FIELD_LABELS;

const TIME_ZONE = "Europe/Stockholm";
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});
const INPUT_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: TIME_ZONE,
  year: "numeric",
});
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const AUDIT_FIELD_ORDER = Object.freeze(
  Object.keys(LICENSE_AUDIT_FIELD_LABELS),
);
const PLAN_KEYS = new Set<string>(LICENSE_PLAN_OPTIONS.map((plan) => plan.key));

export type LicenseLifecycleOperation =
  "activate" | "reactivate" | "renew" | "suspend" | "terminate";

// Only state-allowed operations render; forbidden ones are never dead
// controls. Expired licenses cannot be (re)activated and Tills vidare cannot
// be renewed, mirroring the database rules.
export function licenseOperations(
  status: LicenseStatusCode,
  validity: LicenseValidityCode,
  openEnded: boolean,
): readonly LicenseLifecycleOperation[] {
  const canActivate = validity !== "expired";
  switch (status) {
    case "draft":
      return canActivate ? ["activate", "terminate"] : ["terminate"];
    case "active":
      return openEnded
        ? ["suspend", "terminate"]
        : ["renew", "suspend", "terminate"];
    case "suspended":
      return [
        ...(canActivate ? (["reactivate"] as const) : []),
        ...(openEnded ? [] : (["renew"] as const)),
        "terminate",
      ];
    case "terminated":
      return [];
  }
}

export function licenseStatusLabel(status: LicenseStatusCode): string {
  return LICENSE_STATUS_LABELS[status];
}
export function licenseValidityLabel(validity: LicenseValidityCode): string {
  return LICENSE_VALIDITY_LABELS[validity];
}
export function formatLicenseDateTime(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}
/** Null end of validity is an explicit business state, never "Saknas". */
export function formatLicenseValidUntil(value: string | null): string {
  return value === null ? "Tills vidare" : formatLicenseDateTime(value);
}
export function formatLicenseRevision(
  revisionBefore: number | null,
  revisionAfter: number,
): string {
  return revisionBefore === null
    ? `Revision ${revisionAfter}`
    : `Revision ${revisionBefore} → ${revisionAfter}`;
}

/** Stockholm wall time for a datetime-local input; seconds only when set. */
export function toStockholmInputValue(value: string | null): string {
  if (value === null) return "";
  const parts = Object.fromEntries(
    INPUT_PARTS_FORMATTER.formatToParts(new Date(value)).map((part) => [
      part.type,
      part.value,
    ]),
  );
  const minute = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  return parts.second === "00" ? minute : `${minute}:${parts.second}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
/** Epoch microseconds as text-sortable BigInt, or null. */
function micros(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;
  const epochMs = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
  if (!Number.isFinite(epochMs)) return null;
  const offset =
    match[8] === "Z"
      ? 0
      : (match[9] === "-" ? -1 : 1) *
        (Number(match[10]) * 60 + Number(match[11]));
  return (
    (BigInt(epochMs) - BigInt(offset) * BigInt(60_000)) * BigInt(1000) +
    BigInt((match[7] ?? "").padEnd(6, "0"))
  );
}
function isTimestamp(value: unknown): value is string {
  return micros(value) !== null;
}
function invalid(): never {
  throw new Error("invalid_license_page");
}

export type LicenseAuditListItem = Readonly<{
  changedFields: readonly LicenseAuditFieldCode[];
  eventType: LicenseAuditEventCode;
  id: string;
  licenseId: string;
  occurredAt: string;
  revisionAfter: number;
  revisionBefore: number | null;
}>;
export type LicenseAuditPagePayload = Readonly<{
  hasMore: boolean;
  items: readonly LicenseAuditListItem[];
  nextCursor: Readonly<{ id: string; occurredAt: string }> | null;
}>;

function auditItem(value: unknown, licenseId: string): LicenseAuditListItem {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    value.licenseId !== licenseId ||
    typeof value.eventType !== "string" ||
    !Object.hasOwn(LICENSE_AUDIT_EVENT_LABELS, value.eventType) ||
    !isTimestamp(value.occurredAt) ||
    !isPositiveInteger(value.revisionAfter) ||
    (value.revisionBefore === null
      ? value.eventType !== "license_created" || value.revisionAfter !== 1
      : !isPositiveInteger(value.revisionBefore) ||
        value.revisionAfter !== value.revisionBefore + 1) ||
    !Array.isArray(value.changedFields) ||
    value.changedFields.length === 0
  )
    return invalid();
  const indexes = value.changedFields.map((field) =>
    typeof field === "string" ? AUDIT_FIELD_ORDER.indexOf(field) : -1,
  );
  if (
    indexes.some(
      (index, at) => index < 0 || (at > 0 && index <= indexes[at - 1]),
    )
  )
    return invalid();
  // Allowlist copy: actor and correlation are never carried into the UI.
  return Object.freeze({
    changedFields: Object.freeze([
      ...value.changedFields,
    ]) as readonly LicenseAuditFieldCode[],
    eventType: value.eventType as LicenseAuditEventCode,
    id: value.id,
    licenseId,
    occurredAt: value.occurredAt,
    revisionAfter: value.revisionAfter,
    revisionBefore: value.revisionBefore as number | null,
  });
}

function newerFirst(
  previous: Readonly<{ id: string; occurredAt: string }>,
  current: Readonly<{ id: string; occurredAt: string }>,
): boolean {
  const left = micros(previous.occurredAt) as bigint;
  const right = micros(current.occurredAt) as bigint;
  return left > right || (left === right && previous.id > current.id);
}

export function parseLicenseAuditPage(
  value: unknown,
  licenseId: string,
  existingItems: readonly LicenseAuditListItem[] = [],
): LicenseAuditPagePayload {
  if (!isRecord(value) || !Array.isArray(value.items)) return invalid();
  const items = value.items.map((item) => auditItem(item, licenseId));
  const all = [...existingItems, ...items];
  if (new Set(all.map((item) => item.id)).size !== all.length) return invalid();
  for (
    let index = Math.max(1, existingItems.length);
    index < all.length;
    index += 1
  ) {
    if (!newerFirst(all[index - 1], all[index])) return invalid();
  }
  const cursor = value.nextCursor;
  const last = items.at(-1);
  if (
    typeof value.hasMore !== "boolean" ||
    (value.hasMore &&
      (!isRecord(cursor) ||
        last === undefined ||
        cursor.id !== last.id ||
        cursor.occurredAt !== last.occurredAt)) ||
    (!value.hasMore && cursor !== null)
  )
    return invalid();
  return Object.freeze({
    hasMore: value.hasMore,
    items: Object.freeze(items),
    nextCursor:
      value.hasMore && last !== undefined
        ? Object.freeze({ id: last.id, occurredAt: last.occurredAt })
        : null,
  });
}

export type LicenseTermsListItem = Readonly<{
  introducedAt: string;
  introducedAtRevision: number;
  licenseId: string;
  maxActiveUsers: number;
  planDisplayLabel: string;
  validFrom: string;
  validUntil: string | null;
  version: number;
}>;
export type LicenseTermsPagePayload = Readonly<{
  hasMore: boolean;
  items: readonly LicenseTermsListItem[];
  nextCursorVersion: number | null;
}>;

function termsItem(value: unknown, licenseId: string): LicenseTermsListItem {
  if (
    !isRecord(value) ||
    value.licenseId !== licenseId ||
    !isPositiveInteger(value.version) ||
    !isPositiveInteger(value.introducedAtRevision) ||
    !isTimestamp(value.introducedAt) ||
    typeof value.planKey !== "string" ||
    !PLAN_KEYS.has(value.planKey) ||
    typeof value.planDisplayLabel !== "string" ||
    !isPositiveInteger(value.maxActiveUsers) ||
    !isTimestamp(value.validFrom) ||
    (value.validUntil !== null && !isTimestamp(value.validUntil))
  )
    return invalid();
  return Object.freeze({
    introducedAt: value.introducedAt,
    introducedAtRevision: value.introducedAtRevision,
    licenseId,
    maxActiveUsers: value.maxActiveUsers,
    planDisplayLabel: value.planDisplayLabel,
    validFrom: value.validFrom,
    validUntil: value.validUntil as string | null,
    version: value.version,
  });
}

export function parseLicenseTermsPage(
  value: unknown,
  licenseId: string,
  existingItems: readonly LicenseTermsListItem[] = [],
): LicenseTermsPagePayload {
  if (!isRecord(value) || !Array.isArray(value.items)) return invalid();
  const items = value.items.map((item) => termsItem(item, licenseId));
  const all = [...existingItems, ...items];
  for (
    let index = Math.max(1, existingItems.length);
    index < all.length;
    index += 1
  ) {
    if (all[index].version >= all[index - 1].version) return invalid();
  }
  const last = items.at(-1);
  if (
    typeof value.hasMore !== "boolean" ||
    (value.hasMore &&
      (last === undefined || value.nextCursorVersion !== last.version)) ||
    (!value.hasMore && value.nextCursorVersion !== null)
  )
    return invalid();
  return Object.freeze({
    hasMore: value.hasMore,
    items: Object.freeze(items),
    nextCursorVersion: value.hasMore && last ? last.version : null,
  });
}
