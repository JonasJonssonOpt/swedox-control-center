import "server-only";

import {
  LicenseServiceError,
  recordUnexpectedLicenseError,
} from "./license.errors";
import { encodeLicenseListCursor } from "./license-cursor";
import {
  LICENSE_PLAN_CATALOG,
  type License,
  type LicenseAuditEvent,
  type LicenseAuditPage,
  type LicenseCurrentTerms,
  type LicenseDetail,
  type LicenseEligibility,
  type LicenseListFilter,
  type LicenseListItem,
  type LicenseListPage,
  type LicenseTermsPage,
  type LicenseTermsVersion,
  type LicenseValidity,
} from "./license.types";
import {
  codePointLength,
  compareTimestamps,
  isLicenseAuditEventType,
  isLicenseEligibilityReason,
  isLicensePlanKey,
  isLicenseStatus,
  isLicenseValidity,
  isPositiveInteger,
  isRecord,
  isTimestamp,
  isUuid,
} from "./license.validation";

// Canonical audit field order, identical to the database constraint.
const CHANGED_FIELDS = [
  "id",
  "tenant_id",
  "status",
  "revision",
  "current_terms_version",
  "plan_key",
  "plan_version",
  "plan_display_label",
  "max_active_users",
  "valid_from",
  "valid_until",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
] as const;
const NO_LICENSE_REASONS = new Set([
  "missing_license",
  "tenant_unavailable",
  "tenant_installation_mismatch",
]);

function malformed(): never {
  recordUnexpectedLicenseError("license_output_invalid");
  throw new LicenseServiceError("unexpected_error");
}
function nullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}
function isLegalName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    codePointLength(value) <= 200
  );
}
function rowsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return malformed();
  return value.map((row) => (isRecord(row) ? row : malformed()));
}

/** Validity derived from the same rule as the database; used as a cross-check. */
export function deriveLicenseValidity(
  at: string,
  validFrom: string,
  validUntil: string | null,
): LicenseValidity {
  if (compareTimestamps(at, validFrom) < 0) return "not_started";
  if (validUntil !== null && compareTimestamps(at, validUntil) >= 0)
    return "expired";
  return "valid";
}

function terms(row: Record<string, unknown>): LicenseCurrentTerms {
  if (
    !isLicensePlanKey(row.plan_key) ||
    !isTimestamp(row.valid_from) ||
    !nullableTimestamp(row.valid_until) ||
    (row.valid_until !== null &&
      compareTimestamps(row.valid_until, row.valid_from) <= 0)
  )
    return malformed();
  const catalog = LICENSE_PLAN_CATALOG[row.plan_key];
  if (
    row.plan_display_label !== catalog.displayLabel ||
    row.max_active_users !== catalog.maxActiveUsers ||
    ("plan_version" in row && row.plan_version !== catalog.version)
  )
    return malformed();
  return Object.freeze({
    maxActiveUsers: catalog.maxActiveUsers,
    planDisplayLabel: catalog.displayLabel,
    planKey: row.plan_key,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  });
}

function revisions(row: Record<string, unknown>): void {
  if (
    !isPositiveInteger(row.revision) ||
    !isPositiveInteger(row.current_terms_version) ||
    row.current_terms_version > row.revision
  )
    malformed();
}

export function mapLicenseRow(value: unknown): License {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isUuid(value.tenant_id) ||
    !isLicenseStatus(value.status) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at) ||
    compareTimestamps(value.updated_at, value.created_at) < 0
  )
    return malformed();
  revisions(value);
  return Object.freeze({
    createdAt: value.created_at,
    currentTermsVersion: value.current_terms_version as number,
    id: value.id,
    revision: value.revision as number,
    status: value.status,
    tenantId: value.tenant_id,
    updatedAt: value.updated_at,
  });
}

function listItem(
  row: Record<string, unknown>,
  evaluatedAt: string,
): LicenseListItem {
  const license = mapLicenseRow(row);
  if (!isLegalName(row.tenant_legal_name) || !isLicenseValidity(row.validity))
    return malformed();
  const current = terms(row);
  if (
    deriveLicenseValidity(
      evaluatedAt,
      current.validFrom,
      current.validUntil,
    ) !== row.validity
  )
    return malformed();
  return Object.freeze({
    ...current,
    createdAt: license.createdAt,
    currentTermsVersion: license.currentTermsVersion,
    id: license.id,
    revision: license.revision,
    status: license.status,
    tenantId: license.tenantId,
    tenantLegalName: row.tenant_legal_name,
    updatedAt: license.updatedAt,
    validity: row.validity,
  });
}

function compareListKeys(
  left: LicenseListItem,
  right: LicenseListItem,
): number {
  const time = compareTimestamps(left.createdAt, right.createdAt);
  if (time !== 0) return time;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function mapLicenseListPage(
  value: unknown,
  filter: LicenseListFilter,
  requestedEvaluatedAt: string | null,
): LicenseListPage {
  const rows = rowsOf(value);
  if (rows.length === 0)
    return Object.freeze({
      evaluatedAt: requestedEvaluatedAt,
      hasMore: false,
      items: Object.freeze([]),
      nextCursor: null,
    });
  const first = rows[0];
  const { evaluated_at: evaluatedAt, has_more: hasMore } = first;
  const cursorAt = first.next_cursor_created_at;
  const cursorId = first.next_cursor_id;
  if (
    !isTimestamp(evaluatedAt) ||
    typeof hasMore !== "boolean" ||
    (requestedEvaluatedAt !== null && evaluatedAt !== requestedEvaluatedAt) ||
    (!hasMore && (cursorAt !== null || cursorId !== null)) ||
    (hasMore && (!isTimestamp(cursorAt) || !isUuid(cursorId))) ||
    rows.some(
      (row) =>
        row.evaluated_at !== evaluatedAt ||
        row.has_more !== hasMore ||
        row.next_cursor_created_at !== cursorAt ||
        row.next_cursor_id !== cursorId,
    )
  )
    return malformed();
  const items = rows.map((row) => listItem(row, evaluatedAt));
  for (let index = 1; index < items.length; index += 1) {
    if (compareListKeys(items[index - 1], items[index]) <= 0)
      return malformed();
  }
  // Exact filters are cross-checked; search is not, since JS and DB case
  // folding may differ outside ASCII.
  for (const item of items) {
    if (
      (filter.tenantId !== null && item.tenantId !== filter.tenantId) ||
      (filter.status !== null && item.status !== filter.status) ||
      (filter.validity !== null && item.validity !== filter.validity) ||
      (!filter.includeTerminated && item.status === "terminated")
    )
      return malformed();
  }
  const last = items[items.length - 1];
  if (hasMore && (last.createdAt !== cursorAt || last.id !== cursorId))
    return malformed();
  return Object.freeze({
    evaluatedAt,
    hasMore,
    items: Object.freeze(items),
    nextCursor: hasMore
      ? encodeLicenseListCursor(
          { createdAt: last.createdAt, evaluatedAt, id: last.id },
          filter,
        )
      : null,
  });
}

export function mapLicenseDetail(
  value: unknown,
  requestedLicenseId: string,
): LicenseDetail {
  const rows = rowsOf(value);
  if (rows.length !== 1) return malformed();
  const row = rows[0];
  if (!isTimestamp(row.evaluated_at) || row.id !== requestedLicenseId)
    return malformed();
  const item = listItem(row, row.evaluated_at);
  return Object.freeze({
    ...item,
    evaluatedAt: row.evaluated_at,
    planVersion: row.plan_version as number,
  });
}

function termsVersion(
  row: Record<string, unknown>,
  licenseId: string,
): LicenseTermsVersion {
  if (
    row.license_id !== licenseId ||
    !isPositiveInteger(row.version) ||
    !isPositiveInteger(row.introduced_at_revision) ||
    row.introduced_at_revision < row.version ||
    !isTimestamp(row.introduced_at) ||
    !isPositiveInteger(row.plan_version)
  )
    return malformed();
  const current = terms(row);
  return Object.freeze({
    ...current,
    introducedAt: row.introduced_at,
    introducedAtRevision: row.introduced_at_revision,
    licenseId,
    planVersion: row.plan_version,
    version: row.version,
  });
}

export function mapLicenseTermsPage(
  value: unknown,
  requestedLicenseId: string,
  requestedCursorVersion: number | null,
): LicenseTermsPage {
  const rows = rowsOf(value);
  if (rows.length === 0)
    return Object.freeze({
      hasMore: false,
      items: Object.freeze([]),
      nextCursorVersion: null,
    });
  const { has_more: hasMore, next_cursor_version: cursor } = rows[0];
  if (
    typeof hasMore !== "boolean" ||
    (!hasMore && cursor !== null) ||
    (hasMore && !isPositiveInteger(cursor)) ||
    rows.some(
      (row) => row.has_more !== hasMore || row.next_cursor_version !== cursor,
    )
  )
    return malformed();
  const items = rows.map((row) => termsVersion(row, requestedLicenseId));
  for (let index = 0; index < items.length; index += 1) {
    const previous =
      index === 0 ? requestedCursorVersion : items[index - 1].version;
    if (previous !== null && items[index].version >= previous)
      return malformed();
  }
  const last = items[items.length - 1];
  if (hasMore && last.version !== cursor) return malformed();
  return Object.freeze({
    hasMore,
    items: Object.freeze(items),
    nextCursorVersion: hasMore ? last.version : null,
  });
}

function auditEvent(
  row: Record<string, unknown>,
  licenseId: string,
): LicenseAuditEvent {
  const fields = row.changed_fields;
  if (
    !isUuid(row.id) ||
    row.license_id !== licenseId ||
    !isLicenseAuditEventType(row.event_type) ||
    !isUuid(row.actor_user_id) ||
    !isTimestamp(row.occurred_at) ||
    !isPositiveInteger(row.revision_after) ||
    (row.revision_before === null
      ? row.event_type !== "license_created" || row.revision_after !== 1
      : row.event_type === "license_created" ||
        !isPositiveInteger(row.revision_before) ||
        row.revision_after !== row.revision_before + 1) ||
    !Array.isArray(fields) ||
    fields.length === 0 ||
    !fields.every(
      (field) =>
        typeof field === "string" &&
        CHANGED_FIELDS.some((allowed) => allowed === field),
    ) ||
    new Set(fields).size !== fields.length ||
    fields.some(
      (field, index) =>
        index > 0 &&
        CHANGED_FIELDS.indexOf(fields[index - 1]) >=
          CHANGED_FIELDS.indexOf(field),
    ) ||
    (row.correlation_id !== null && !isUuid(row.correlation_id))
  )
    return malformed();
  return Object.freeze({
    actorUserId: row.actor_user_id,
    changedFields: Object.freeze([...(fields as string[])]),
    correlationId: row.correlation_id as string | null,
    eventType: row.event_type,
    id: row.id,
    licenseId,
    occurredAt: row.occurred_at,
    revisionAfter: row.revision_after,
    revisionBefore: row.revision_before as number | null,
  });
}

export function mapLicenseAuditPage(
  value: unknown,
  requestedLicenseId: string,
): LicenseAuditPage {
  const rows = rowsOf(value);
  if (rows.length === 0)
    return Object.freeze({
      hasMore: false,
      items: Object.freeze([]),
      nextCursor: null,
    });
  const first = rows[0];
  const hasMore = first.has_more;
  const cursorAt = first.next_cursor_occurred_at;
  const cursorId = first.next_cursor_id;
  if (
    typeof hasMore !== "boolean" ||
    (!hasMore && (cursorAt !== null || cursorId !== null)) ||
    (hasMore && (!isTimestamp(cursorAt) || !isUuid(cursorId))) ||
    rows.some(
      (row) =>
        row.has_more !== hasMore ||
        row.next_cursor_occurred_at !== cursorAt ||
        row.next_cursor_id !== cursorId,
    )
  )
    return malformed();
  const items = rows.map((row) => auditEvent(row, requestedLicenseId));
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    const time = compareTimestamps(previous.occurredAt, current.occurredAt);
    if (time < 0 || (time === 0 && previous.id <= current.id))
      return malformed();
  }
  const last = items[items.length - 1];
  if (hasMore && (last.occurredAt !== cursorAt || last.id !== cursorId))
    return malformed();
  return Object.freeze({
    hasMore,
    items: Object.freeze(items),
    nextCursor: hasMore
      ? Object.freeze({ id: last.id, occurredAt: last.occurredAt })
      : null,
  });
}

export function mapLicenseEligibility(value: unknown): LicenseEligibility {
  const rows = rowsOf(value);
  if (rows.length !== 1) return malformed();
  const row = rows[0];
  if (
    typeof row.eligible !== "boolean" ||
    !isLicenseEligibilityReason(row.reason) ||
    row.eligible !== (row.reason === "eligible") ||
    !isTimestamp(row.evaluated_at)
  )
    return malformed();
  if (NO_LICENSE_REASONS.has(row.reason)) {
    if (
      row.license_id !== null ||
      row.revision !== null ||
      row.terms_version !== null ||
      row.valid_until !== null
    )
      return malformed();
  } else if (
    !isUuid(row.license_id) ||
    !isPositiveInteger(row.revision) ||
    !isPositiveInteger(row.terms_version) ||
    row.terms_version > row.revision ||
    !nullableTimestamp(row.valid_until) ||
    (row.reason === "eligible" &&
      row.valid_until !== null &&
      compareTimestamps(row.evaluated_at, row.valid_until) >= 0)
  )
    return malformed();
  return Object.freeze({
    eligible: row.eligible,
    evaluatedAt: row.evaluated_at,
    licenseId: row.license_id as string | null,
    reason: row.reason,
    revision: row.revision as number | null,
    termsVersion: row.terms_version as number | null,
    validUntil: row.valid_until as string | null,
  });
}
