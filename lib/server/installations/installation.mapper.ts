import "server-only";

import {
  recordUnexpectedInstallationError,
  InstallationServiceError,
} from "./installation.errors";
import type {
  Installation,
  InstallationAuditEvent,
  InstallationAuditPage,
  InstallationDetail,
  InstallationListItem,
  InstallationListPage,
} from "./installation.types";
import {
  isApplicationHost,
  isApplicationUrl,
  isCanonicalName,
  isInstallationAuditEventType,
  isInstallationEnvironment,
  isInstallationStatus,
  isPositiveRevision,
  isRecord,
  isTimestamp,
  isUuid,
} from "./installation.validation";

const CHANGED_FIELDS = [
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
] as const;
const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{1,64}$/;
const REGION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function malformed(): never {
  recordUnexpectedInstallationError();
  throw new InstallationServiceError("unexpected_error");
}
function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
function baseRow(value: unknown): Installation {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isUuid(value.tenant_id) ||
    typeof value.installation_code !== "string" ||
    value.installation_code.length > 64 ||
    !CODE_PATTERN.test(value.installation_code) ||
    !isCanonicalName(value.display_name) ||
    !isInstallationEnvironment(value.environment) ||
    !isInstallationStatus(value.administrative_status) ||
    !nullableString(value.application_url) ||
    (value.application_url !== null &&
      !isApplicationUrl(value.application_url)) ||
    !nullableString(value.supabase_project_ref) ||
    (value.supabase_project_ref !== null &&
      !PROJECT_REF_PATTERN.test(value.supabase_project_ref)) ||
    !nullableString(value.hosting_region) ||
    (value.hosting_region !== null &&
      !REGION_PATTERN.test(value.hosting_region)) ||
    !nullableString(value.administrative_note) ||
    (value.administrative_note !== null &&
      (value.administrative_note.length < 1 ||
        value.administrative_note.length > 1000 ||
        value.administrative_note !== value.administrative_note.trim())) ||
    !isPositiveRevision(value.revision) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at) ||
    !nullableString(value.archived_at) ||
    (value.archived_at !== null && !isTimestamp(value.archived_at))
  )
    return malformed();
  return Object.freeze({
    administrativeNote: value.administrative_note,
    administrativeStatus: value.administrative_status,
    applicationUrl: value.application_url,
    archivedAt: value.archived_at,
    createdAt: value.created_at,
    displayName: value.display_name,
    environment: value.environment,
    hostingRegion: value.hosting_region,
    id: value.id,
    installationCode: value.installation_code,
    revision: value.revision,
    supabaseProjectRef: value.supabase_project_ref,
    tenantId: value.tenant_id,
    updatedAt: value.updated_at,
  });
}

export function mapInstallationRow(value: unknown): Installation {
  return baseRow(value);
}

export function mapInstallationDetailRow(value: unknown): InstallationDetail {
  const installation = baseRow(value);
  if (!isRecord(value)) return malformed();
  const tenant = value.tenants;
  const legalName =
    isRecord(tenant) && isCanonicalName(tenant.legal_name, 200)
      ? tenant.legal_name
      : Array.isArray(tenant) &&
          tenant.length === 1 &&
          isRecord(tenant[0]) &&
          isCanonicalName(tenant[0].legal_name, 200)
        ? tenant[0].legal_name
        : null;
  if (legalName === null) return malformed();
  return Object.freeze({ ...installation, tenantLegalName: legalName });
}

function mapListItem(row: Record<string, unknown>): InstallationListItem {
  if (
    !isUuid(row.id) ||
    !isUuid(row.tenant_id) ||
    !isCanonicalName(row.tenant_legal_name, 200) ||
    typeof row.installation_code !== "string" ||
    !CODE_PATTERN.test(row.installation_code) ||
    !isCanonicalName(row.display_name) ||
    !isInstallationEnvironment(row.environment) ||
    !isInstallationStatus(row.administrative_status) ||
    !nullableString(row.hosting_region) ||
    (row.hosting_region !== null && !REGION_PATTERN.test(row.hosting_region)) ||
    !nullableString(row.application_host) ||
    (row.application_host !== null &&
      !isApplicationHost(row.application_host)) ||
    !isPositiveRevision(row.revision) ||
    !isTimestamp(row.updated_at) ||
    !nullableString(row.archived_at) ||
    (row.archived_at !== null && !isTimestamp(row.archived_at))
  )
    return malformed();
  return Object.freeze({
    administrativeStatus: row.administrative_status,
    applicationHost: row.application_host,
    archivedAt: row.archived_at,
    displayName: row.display_name,
    environment: row.environment,
    hostingRegion: row.hosting_region,
    id: row.id,
    installationCode: row.installation_code,
    revision: row.revision,
    tenantId: row.tenant_id,
    tenantLegalName: row.tenant_legal_name,
    updatedAt: row.updated_at,
  });
}

export function mapInstallationListPage(value: unknown): InstallationListPage {
  if (!Array.isArray(value)) return malformed();
  if (value.length === 0)
    return Object.freeze({
      hasMore: false,
      items: Object.freeze([]),
      nextCursor: null,
    });
  const rows = value.map((row) => (isRecord(row) ? row : malformed()));
  const first = rows[0];
  const hasMore = first.has_more;
  const cursorName = first.next_cursor_display_name;
  const cursorId = first.next_cursor_id;
  const nullCursor = cursorName === null && cursorId === null;
  const completeCursor = isCanonicalName(cursorName) && isUuid(cursorId);
  if (
    typeof hasMore !== "boolean" ||
    (!hasMore && !nullCursor) ||
    (hasMore && !completeCursor) ||
    rows.some(
      (row) =>
        row.has_more !== hasMore ||
        row.next_cursor_display_name !== cursorName ||
        row.next_cursor_id !== cursorId,
    )
  )
    return malformed();
  const items = rows.map(mapListItem);
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (
      previous.displayName > current.displayName ||
      (previous.displayName === current.displayName &&
        previous.id >= current.id)
    )
      return malformed();
  }
  const last = items.at(-1);
  if (
    hasMore &&
    (last === undefined ||
      last.displayName !== cursorName ||
      last.id !== cursorId)
  )
    return malformed();
  return Object.freeze({
    hasMore,
    items: Object.freeze(items),
    nextCursor: hasMore
      ? Object.freeze({
          displayName: cursorName as string,
          id: cursorId as string,
        })
      : null,
  });
}

function mapAuditEvent(row: Record<string, unknown>): InstallationAuditEvent {
  if (
    !isUuid(row.id) ||
    !isUuid(row.installation_id) ||
    !isInstallationAuditEventType(row.event_type) ||
    !isUuid(row.actor_user_id) ||
    !isTimestamp(row.occurred_at) ||
    (row.revision_before !== null &&
      !isPositiveRevision(row.revision_before)) ||
    !isPositiveRevision(row.revision_after) ||
    (row.revision_before === null
      ? row.event_type !== "installation_created" || row.revision_after !== 1
      : row.revision_after !== row.revision_before + 1) ||
    !Array.isArray(row.changed_fields) ||
    row.changed_fields.length === 0 ||
    !row.changed_fields.every(
      (field) =>
        typeof field === "string" &&
        CHANGED_FIELDS.some((allowed) => allowed === field),
    ) ||
    new Set(row.changed_fields).size !== row.changed_fields.length ||
    [...row.changed_fields]
      .sort((a, b) => CHANGED_FIELDS.indexOf(a) - CHANGED_FIELDS.indexOf(b))
      .join("\0") !== row.changed_fields.join("\0") ||
    (row.correlation_id !== null && !isUuid(row.correlation_id))
  )
    return malformed();
  return Object.freeze({
    actorUserId: row.actor_user_id,
    changedFields: Object.freeze([...row.changed_fields]),
    correlationId: row.correlation_id as string | null,
    eventType: row.event_type as InstallationAuditEvent["eventType"],
    id: row.id,
    installationId: row.installation_id,
    occurredAt: row.occurred_at,
    revisionAfter: row.revision_after,
    revisionBefore: row.revision_before as number | null,
  });
}

export function mapInstallationAuditPage(
  value: unknown,
  requestedInstallationId: string,
): InstallationAuditPage {
  if (!Array.isArray(value)) return malformed();
  if (value.length === 0)
    return Object.freeze({
      hasMore: false,
      items: Object.freeze([]),
      nextCursor: null,
    });
  const rows = value.map((row) => (isRecord(row) ? row : malformed()));
  const first = rows[0];
  const hasMore = first.has_more;
  const cursorAt = first.next_cursor_occurred_at;
  const cursorId = first.next_cursor_id;
  const nullCursor = cursorAt === null && cursorId === null;
  const completeCursor = isTimestamp(cursorAt) && isUuid(cursorId);
  if (
    typeof hasMore !== "boolean" ||
    (!hasMore && !nullCursor) ||
    (hasMore && !completeCursor) ||
    rows.some(
      (row) =>
        row.installation_id !== requestedInstallationId ||
        row.has_more !== hasMore ||
        row.next_cursor_occurred_at !== cursorAt ||
        row.next_cursor_id !== cursorId,
    )
  )
    return malformed();
  const items = rows.map(mapAuditEvent);
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (
      previous.occurredAt < current.occurredAt ||
      (previous.occurredAt === current.occurredAt && previous.id <= current.id)
    )
      return malformed();
  }
  const last = items.at(-1);
  if (
    hasMore &&
    (last === undefined || last.occurredAt !== cursorAt || last.id !== cursorId)
  )
    return malformed();
  return Object.freeze({
    hasMore,
    items: Object.freeze(items),
    nextCursor: hasMore
      ? Object.freeze({
          id: cursorId as string,
          occurredAt: cursorAt as string,
        })
      : null,
  });
}
