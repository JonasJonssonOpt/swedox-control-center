import "server-only";

import { LicenseServiceError } from "./license.errors";
import {
  LICENSE_AUDIT_EVENT_TYPES,
  LICENSE_ELIGIBILITY_REASONS,
  LICENSE_PLAN_KEYS,
  LICENSE_STATUSES,
  LICENSE_VALIDITIES,
  type ChangeLicenseTermsInput,
  type CreateLicenseInput,
  type LicenseAuditEventType,
  type LicenseEligibilityReason,
  type LicenseLifecycleInput,
  type LicenseListFilter,
  type LicensePlanKey,
  type LicenseProvisioningEligibilityInput,
  type LicenseStatus,
  type LicenseValidity,
  type ListLicenseAuditEventsInput,
  type ListLicenseTermsVersionsInput,
  type ListLicensesInput,
  type RenewLicenseInput,
} from "./license.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// ISO-8601 with an explicit offset and at most microsecond precision, as
// PostgreSQL emits timestamptz. Calendar fields are checked separately.
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
export const LICENSE_SEARCH_MAX_LENGTH = 200;

function invalid(): never {
  throw new LicenseServiceError("validation_error");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// Lowercase only: PostgreSQL emits lowercase UUIDs and the tie order compares text.
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Epoch microseconds without the millisecond loss of JS Date, or null. */
export function timestampMicros(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  const epochMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(epochMs);
  if (
    year < 1 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  )
    return null;
  let offsetMinutes = 0;
  if (match[8] !== "Z") {
    const offsetHours = Number(match[10]);
    const offsetRest = Number(match[11]);
    if (offsetHours > 15 || offsetRest > 59) return null;
    offsetMinutes =
      (match[9] === "-" ? -1 : 1) * (offsetHours * 60 + offsetRest);
  }
  const fraction = BigInt((match[7] ?? "").padEnd(6, "0"));
  return (
    (BigInt(epochMs) - BigInt(offsetMinutes) * BigInt(60_000)) * BigInt(1000) +
    fraction
  );
}
export function isTimestamp(value: unknown): value is string {
  return timestampMicros(value) !== null;
}
export function compareTimestamps(left: string, right: string): number {
  const l = timestampMicros(left);
  const r = timestampMicros(right);
  if (l === null || r === null) return invalid();
  return l < r ? -1 : l > r ? 1 : 0;
}

export function isLicenseStatus(value: unknown): value is LicenseStatus {
  return LICENSE_STATUSES.some((item) => item === value);
}
export function isLicenseValidity(value: unknown): value is LicenseValidity {
  return LICENSE_VALIDITIES.some((item) => item === value);
}
export function isLicensePlanKey(value: unknown): value is LicensePlanKey {
  return LICENSE_PLAN_KEYS.some((item) => item === value);
}
export function isLicenseAuditEventType(
  value: unknown,
): value is LicenseAuditEventType {
  return LICENSE_AUDIT_EVENT_TYPES.some((item) => item === value);
}
export function isLicenseEligibilityReason(
  value: unknown,
): value is LicenseEligibilityReason {
  return LICENSE_ELIGIBILITY_REASONS.some((item) => item === value);
}
export function codePointLength(value: string): number {
  return [...value].length;
}

function optionalUuid(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return isUuid(value) ? value : invalid();
}
function correlation(value: unknown): string | null {
  return optionalUuid(value);
}
function optionalTimestamp(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return isTimestamp(value) ? value : invalid();
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
function plan(value: unknown): LicensePlanKey {
  return isLicensePlanKey(value) ? value : invalid();
}
function interval(validFrom: string | null, validUntil: string | null): void {
  if (
    validFrom !== null &&
    validUntil !== null &&
    compareTimestamps(validUntil, validFrom) <= 0
  )
    invalid();
}

export function validateLicenseId(value: unknown): asserts value is string {
  if (!isUuid(value)) invalid();
}

export function normalizeLicenseSearch(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return invalid();
  const search = value.trim();
  if (search === "") return null;
  if (codePointLength(search) > LICENSE_SEARCH_MAX_LENGTH) return invalid();
  return search;
}

export type ValidListLicensesInput = Readonly<{
  cursor: string | null;
  filter: LicenseListFilter;
  pageSize: number;
}>;

export function validateListLicensesInput(
  input: ListLicensesInput = {},
): ValidListLicensesInput {
  if (!isRecord(input)) return invalid();
  const status =
    input.status === undefined || input.status === null
      ? null
      : isLicenseStatus(input.status)
        ? input.status
        : invalid();
  const validity =
    input.validity === undefined || input.validity === null
      ? null
      : isLicenseValidity(input.validity)
        ? input.validity
        : invalid();
  if (
    input.includeTerminated !== undefined &&
    typeof input.includeTerminated !== "boolean"
  )
    return invalid();
  const includeTerminated = input.includeTerminated ?? false;
  if (status === "terminated" && !includeTerminated) return invalid();
  if (
    input.cursor !== undefined &&
    input.cursor !== null &&
    typeof input.cursor !== "string"
  )
    return invalid();
  return Object.freeze({
    cursor: input.cursor ?? null,
    filter: Object.freeze({
      includeTerminated,
      search: normalizeLicenseSearch(input.search),
      status,
      tenantId: optionalUuid(input.tenantId),
      validity,
    }),
    pageSize: pageSize(input.pageSize, 50),
  });
}

export function validateTermsListInput(
  input: ListLicenseTermsVersionsInput,
): Readonly<{
  cursorVersion: number | null;
  licenseId: string;
  pageSize: number;
}> {
  if (!isRecord(input) || !isUuid(input.licenseId)) return invalid();
  const cursorVersion =
    input.cursorVersion === undefined || input.cursorVersion === null
      ? null
      : isPositiveInteger(input.cursorVersion)
        ? input.cursorVersion
        : invalid();
  return Object.freeze({
    cursorVersion,
    licenseId: input.licenseId,
    pageSize: pageSize(input.pageSize, 25),
  });
}

export function validateAuditListInput(
  input: ListLicenseAuditEventsInput,
): ListLicenseAuditEventsInput & { pageSize: number } {
  if (!isRecord(input) || !isUuid(input.licenseId)) return invalid();
  if (
    input.cursor !== undefined &&
    input.cursor !== null &&
    (!isRecord(input.cursor) ||
      !isUuid(input.cursor.id) ||
      !isTimestamp(input.cursor.occurredAt))
  )
    return invalid();
  return Object.freeze({
    cursor: input.cursor ?? null,
    licenseId: input.licenseId,
    pageSize: pageSize(input.pageSize, 25),
  });
}

export function validateEligibilityInput(
  input: LicenseProvisioningEligibilityInput,
): Readonly<{ installationId: string | null; tenantId: string }> {
  if (!isRecord(input) || !isUuid(input.tenantId)) return invalid();
  return Object.freeze({
    installationId: optionalUuid(input.installationId),
    tenantId: input.tenantId,
  });
}

export function validateCreateLicenseInput(
  input: CreateLicenseInput,
): CreateLicenseInput {
  if (!isRecord(input) || !isUuid(input.tenantId)) return invalid();
  const validFrom = optionalTimestamp(input.validFrom);
  const validUntil = optionalTimestamp(input.validUntil);
  interval(validFrom, validUntil);
  return Object.freeze({
    correlationId: correlation(input.correlationId),
    planKey: plan(input.planKey),
    tenantId: input.tenantId,
    validFrom,
    validUntil,
  });
}

export function validateLifecycleInput(
  input: LicenseLifecycleInput,
): LicenseLifecycleInput {
  if (
    !isRecord(input) ||
    !isUuid(input.licenseId) ||
    !isPositiveInteger(input.expectedRevision)
  )
    return invalid();
  return Object.freeze({
    correlationId: correlation(input.correlationId),
    expectedRevision: input.expectedRevision,
    licenseId: input.licenseId,
  });
}

export function validateChangeTermsInput(
  input: ChangeLicenseTermsInput,
): ChangeLicenseTermsInput {
  const lifecycle = validateLifecycleInput(input);
  const validFrom = optionalTimestamp(input.validFrom);
  const validUntil = optionalTimestamp(input.validUntil);
  interval(validFrom, validUntil);
  return Object.freeze({
    ...lifecycle,
    planKey: plan(input.planKey),
    validFrom,
    validUntil,
  });
}

export function validateRenewInput(
  input: RenewLicenseInput,
): RenewLicenseInput {
  const lifecycle = validateLifecycleInput(input);
  // Explicit: undefined is not Tills vidare.
  if (!("validUntil" in input) || input.validUntil === undefined)
    return invalid();
  return Object.freeze({
    ...lifecycle,
    validUntil: optionalTimestamp(input.validUntil),
  });
}
