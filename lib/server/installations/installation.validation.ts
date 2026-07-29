import "server-only";

import { InstallationServiceError } from "./installation.errors";
import {
  INSTALLATION_ADMINISTRATIVE_STATUSES,
  INSTALLATION_AUDIT_EVENT_TYPES,
  INSTALLATION_ENVIRONMENTS,
  type CreateInstallationInput,
  type InstallationAdministrativeStatus,
  type InstallationEnvironment,
  type InstallationLifecycleInput,
  type ListInstallationAuditEventsInput,
  type ListInstallationsInput,
  type UpdateInstallationInput,
} from "./installation.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{1,64}$/;
const REGION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPEATED_WHITESPACE_PATTERN = /\s{2,}/;

function invalid(): never {
  throw new InstallationServiceError("validation_error");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
export function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}
export function isPositiveRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
export function isInstallationEnvironment(
  value: unknown,
): value is InstallationEnvironment {
  return INSTALLATION_ENVIRONMENTS.some((item) => item === value);
}
export function isInstallationStatus(
  value: unknown,
): value is InstallationAdministrativeStatus {
  return INSTALLATION_ADMINISTRATIVE_STATUSES.some((item) => item === value);
}
export function isInstallationAuditEventType(value: unknown): boolean {
  return INSTALLATION_AUDIT_EVENT_TYPES.some((item) => item === value);
}
export function isCanonicalName(
  value: unknown,
  maximum = 120,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value === value.trim() &&
    !REPEATED_WHITESPACE_PATTERN.test(value)
  );
}
export function isApplicationUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 9 || value.length > 2048)
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      value === value.trim()
    );
  } catch {
    return false;
  }
}
export function isApplicationHost(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.toLowerCase() &&
    !value.includes(":") &&
    !value.includes("/") &&
    !/\s/.test(value) &&
    /^[a-z0-9.-]+$/.test(value)
  );
}

function normalizeNullable(
  value: unknown,
  maximum: number,
  validator?: (value: string) => boolean,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length > maximum ||
    value.length === 0 ||
    (validator && !validator(value))
  )
    return invalid();
  return value;
}
function correlation(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!isUuid(value)) return invalid();
  return value;
}
function pageSize(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 100
  )
    return invalid();
  return value as number;
}

export function validateInstallationId(
  value: unknown,
): asserts value is string {
  if (!isUuid(value)) invalid();
}

export function validateListInstallationsInput(
  input: ListInstallationsInput = {},
): Required<Pick<ListInstallationsInput, "includeArchived" | "pageSize">> &
  ListInstallationsInput {
  if (!isRecord(input)) return invalid();
  if (
    input.tenantId !== undefined &&
    input.tenantId !== null &&
    !isUuid(input.tenantId)
  )
    return invalid();
  if (
    input.environment !== undefined &&
    input.environment !== null &&
    !isInstallationEnvironment(input.environment)
  )
    return invalid();
  if (
    input.administrativeStatus !== undefined &&
    input.administrativeStatus !== null &&
    !isInstallationStatus(input.administrativeStatus)
  )
    return invalid();
  if (
    input.includeArchived !== undefined &&
    typeof input.includeArchived !== "boolean"
  )
    return invalid();
  if (
    input.cursor !== undefined &&
    input.cursor !== null &&
    (!isRecord(input.cursor) ||
      !isUuid(input.cursor.id) ||
      !isCanonicalName(input.cursor.displayName))
  )
    return invalid();
  const search =
    input.search === undefined ||
    input.search === null ||
    input.search.trim() === ""
      ? null
      : input.search.trim();
  if (
    search !== null &&
    (search.length > 120 || REPEATED_WHITESPACE_PATTERN.test(search))
  )
    return invalid();
  return Object.freeze({
    ...input,
    includeArchived: input.includeArchived ?? false,
    pageSize: pageSize(input.pageSize, 50),
    search,
  });
}

export function validateAuditListInput(
  input: ListInstallationAuditEventsInput,
): ListInstallationAuditEventsInput & { pageSize: number } {
  if (!isRecord(input) || !isUuid(input.installationId)) return invalid();
  if (
    input.cursor !== undefined &&
    input.cursor !== null &&
    (!isRecord(input.cursor) ||
      !isUuid(input.cursor.id) ||
      !isTimestamp(input.cursor.occurredAt))
  )
    return invalid();
  return Object.freeze({ ...input, pageSize: pageSize(input.pageSize, 25) });
}

export function validateCreateInstallationInput(
  input: CreateInstallationInput,
): CreateInstallationInput {
  if (
    !isRecord(input) ||
    !isUuid(input.tenantId) ||
    typeof input.installationCode !== "string" ||
    !CODE_PATTERN.test(input.installationCode) ||
    input.installationCode.length > 64 ||
    !isCanonicalName(input.displayName) ||
    !isInstallationEnvironment(input.environment)
  )
    return invalid();
  return Object.freeze({
    ...input,
    administrativeNote: normalizeNullable(input.administrativeNote, 1000),
    applicationUrl: normalizeNullable(
      input.applicationUrl,
      2048,
      isApplicationUrl,
    ),
    correlationId: correlation(input.correlationId),
    hostingRegion: normalizeNullable(input.hostingRegion, 64, (v) =>
      REGION_PATTERN.test(v),
    ),
    supabaseProjectRef: normalizeNullable(input.supabaseProjectRef, 64, (v) =>
      PROJECT_REF_PATTERN.test(v),
    ),
  });
}

export function validateUpdateInstallationInput(
  input: UpdateInstallationInput,
): UpdateInstallationInput {
  if (
    !isRecord(input) ||
    !isUuid(input.installationId) ||
    !isPositiveRevision(input.expectedRevision) ||
    !isCanonicalName(input.displayName)
  )
    return invalid();
  return Object.freeze({
    ...input,
    administrativeNote: normalizeNullable(input.administrativeNote, 1000),
    applicationUrl: normalizeNullable(
      input.applicationUrl,
      2048,
      isApplicationUrl,
    ),
    correlationId: correlation(input.correlationId),
    hostingRegion: normalizeNullable(input.hostingRegion, 64, (v) =>
      REGION_PATTERN.test(v),
    ),
    supabaseProjectRef: normalizeNullable(input.supabaseProjectRef, 64, (v) =>
      PROJECT_REF_PATTERN.test(v),
    ),
  });
}

export function validateLifecycleInput(
  input: InstallationLifecycleInput,
): InstallationLifecycleInput {
  if (
    !isRecord(input) ||
    !isUuid(input.installationId) ||
    !isPositiveRevision(input.expectedRevision)
  )
    return invalid();
  return Object.freeze({
    ...input,
    correlationId: correlation(input.correlationId),
  });
}
