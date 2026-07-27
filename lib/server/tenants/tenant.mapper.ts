import "server-only";

import {
  type Tenant,
  type TenantAuditEvent,
  type TenantAuditPage,
} from "./tenant.types";
import {
  isPositiveRevision,
  isRecord,
  isTenantAuditEventType,
  isTenantCategory,
  isTenantStatus,
  isTimestamp,
  isUuid,
} from "./tenant.validation";
import {
  recordUnexpectedTenantError,
  TenantServiceError,
} from "./tenant.errors";

const TENANT_CHANGED_FIELDS = [
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
] as const;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function malformed(): never {
  recordUnexpectedTenantError();
  throw new TenantServiceError("unexpected_error");
}

export function mapTenantRow(value: unknown): Tenant {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isTenantCategory(value.category) ||
    !isNullableString(value.organization_number) ||
    typeof value.legal_name !== "string" ||
    !isNullableString(value.contact_name) ||
    !isNullableString(value.contact_email) ||
    !isNullableString(value.contact_phone) ||
    value.country_code !== "SE" ||
    !isTenantStatus(value.operational_status) ||
    !isNullableString(value.archived_at) ||
    !isNullableString(value.archived_by) ||
    !isPositiveRevision(value.revision) ||
    !isTimestamp(value.created_at) ||
    !isUuid(value.created_by) ||
    !isTimestamp(value.updated_at) ||
    !isUuid(value.updated_by) ||
    !isNullableString(value.administrative_note) ||
    (value.archived_at !== null && !isTimestamp(value.archived_at)) ||
    (value.archived_by !== null && !isUuid(value.archived_by)) ||
    (value.archived_at === null) !== (value.archived_by === null)
  ) {
    return malformed();
  }

  return Object.freeze({
    administrativeNote: value.administrative_note,
    archivedAt: value.archived_at,
    archivedBy: value.archived_by,
    category: value.category,
    contactEmail: value.contact_email,
    contactName: value.contact_name,
    contactPhone: value.contact_phone,
    countryCode: value.country_code,
    createdAt: value.created_at,
    createdBy: value.created_by,
    id: value.id,
    legalName: value.legal_name,
    operationalStatus: value.operational_status,
    organizationNumber: value.organization_number,
    revision: value.revision,
    updatedAt: value.updated_at,
    updatedBy: value.updated_by,
  });
}

function mapAuditEvent(value: Record<string, unknown>): TenantAuditEvent {
  if (
    !isUuid(value.id) ||
    !isUuid(value.tenant_id) ||
    !isTenantAuditEventType(value.event_type) ||
    !isUuid(value.actor_user_id) ||
    !isTimestamp(value.occurred_at) ||
    (value.revision_before !== null &&
      !isPositiveRevision(value.revision_before)) ||
    !isPositiveRevision(value.revision_after) ||
    !Array.isArray(value.changed_fields) ||
    value.changed_fields.length === 0 ||
    !value.changed_fields.every(
      (field) =>
        typeof field === "string" &&
        TENANT_CHANGED_FIELDS.some((allowed) => allowed === field),
    ) ||
    new Set(value.changed_fields).size !== value.changed_fields.length ||
    [...value.changed_fields].sort().join("\0") !==
      value.changed_fields.join("\0") ||
    (value.correlation_id !== null && !isUuid(value.correlation_id))
  ) {
    return malformed();
  }

  return Object.freeze({
    actorUserId: value.actor_user_id,
    changedFields: Object.freeze([...value.changed_fields]),
    correlationId: value.correlation_id as string | null,
    eventType: value.event_type as TenantAuditEvent["eventType"],
    id: value.id,
    occurredAt: value.occurred_at,
    revisionAfter: value.revision_after,
    revisionBefore: value.revision_before as number | null,
    tenantId: value.tenant_id,
  });
}

export function mapTenantAuditPage(
  value: unknown,
  requestedTenantId: string,
): TenantAuditPage {
  if (!Array.isArray(value)) {
    return malformed();
  }

  if (value.length === 0) {
    return Object.freeze({
      hasMore: false,
      items: Object.freeze([]),
      nextCursor: null,
    });
  }

  const rows = value.map((row) => {
    if (!isRecord(row)) {
      return malformed();
    }
    return row;
  });
  const first = rows[0];

  if (
    typeof first.has_more !== "boolean" ||
    !isNullableString(first.next_cursor_occurred_at) ||
    !isNullableString(first.next_cursor_id)
  ) {
    return malformed();
  }

  const cursorIsNull =
    first.next_cursor_occurred_at === null && first.next_cursor_id === null;
  const cursorIsComplete =
    isTimestamp(first.next_cursor_occurred_at) && isUuid(first.next_cursor_id);

  if (
    (!first.has_more && !cursorIsNull) ||
    (first.has_more && !cursorIsComplete) ||
    rows.some(
      (row) =>
        row.has_more !== first.has_more ||
        row.next_cursor_occurred_at !== first.next_cursor_occurred_at ||
        row.next_cursor_id !== first.next_cursor_id ||
        row.tenant_id !== requestedTenantId,
    )
  ) {
    return malformed();
  }

  const items = rows.map(mapAuditEvent);
  const lastItem = items.at(-1);

  if (
    first.has_more &&
    (lastItem?.occurredAt !== first.next_cursor_occurred_at ||
      lastItem.id !== first.next_cursor_id)
  ) {
    return malformed();
  }

  return Object.freeze({
    hasMore: first.has_more,
    items: Object.freeze(items),
    nextCursor: first.has_more
      ? Object.freeze({
          id: first.next_cursor_id as string,
          occurredAt: first.next_cursor_occurred_at as string,
        })
      : null,
  });
}
