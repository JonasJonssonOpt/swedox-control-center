import "server-only";

import {
  TENANT_AUDIT_EVENT_TYPES,
  TENANT_CATEGORIES,
  TENANT_STATUSES,
  type CreateTenantInput,
  type ListTenantAuditEventsInput,
  type TenantCategory,
  type TenantOperationalStatus,
  type TenantStateMutationInput,
  type UpdateTenantInput,
} from "./tenant.types";
import { TenantServiceError } from "./tenant.errors";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORGANIZATION_NUMBER_INPUT_PATTERN = /^[0-9\s-]+$/;

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
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

export function isTenantCategory(value: unknown): value is TenantCategory {
  return TENANT_CATEGORIES.some((category) => category === value);
}

export function isTenantStatus(
  value: unknown,
): value is TenantOperationalStatus {
  return TENANT_STATUSES.some((status) => status === value);
}

export function isTenantAuditEventType(value: unknown): boolean {
  return TENANT_AUDIT_EVENT_TYPES.some((eventType) => eventType === value);
}

function assertNullableString(
  value: unknown,
  maximumLength: number,
): asserts value is string | null {
  if (
    value !== null &&
    (typeof value !== "string" ||
      value.trim().length === 0 ||
      value.length > maximumLength)
  ) {
    throw new TenantServiceError("validation_error");
  }
}

function assertCorrelationId(value: unknown): void {
  if (value !== undefined && value !== null && !isUuid(value)) {
    throw new TenantServiceError("validation_error");
  }
}

function assertOrganizationNumber(
  value: unknown,
  category?: TenantCategory,
): asserts value is string | null {
  if (value === null) {
    if (category === "customer" || category === "pilot") {
      throw new TenantServiceError("validation_error");
    }
    return;
  }

  if (
    typeof value !== "string" ||
    !ORGANIZATION_NUMBER_INPUT_PATTERN.test(value)
  ) {
    throw new TenantServiceError("validation_error");
  }
}

export function validateTenantId(value: unknown): asserts value is string {
  if (!isUuid(value)) {
    throw new TenantServiceError("validation_error");
  }
}

export function validateCreateTenantInput(
  input: CreateTenantInput,
): CreateTenantInput {
  if (
    !isRecord(input) ||
    !isTenantCategory(input.category) ||
    typeof input.legalName !== "string" ||
    input.legalName.trim().length === 0 ||
    input.legalName.length > 200
  ) {
    throw new TenantServiceError("validation_error");
  }

  assertOrganizationNumber(input.organizationNumber, input.category);
  assertNullableString(input.contactName ?? null, 120);
  assertNullableString(input.contactEmail ?? null, 254);
  assertNullableString(input.contactPhone ?? null, 32);
  assertNullableString(input.administrativeNote ?? null, 1000);
  assertCorrelationId(input.correlationId);
  return input;
}

export function validateUpdateTenantInput(
  input: UpdateTenantInput,
): UpdateTenantInput {
  if (
    !isRecord(input) ||
    !isUuid(input.tenantId) ||
    !isPositiveRevision(input.expectedRevision) ||
    typeof input.legalName !== "string" ||
    input.legalName.trim().length === 0 ||
    input.legalName.length > 200
  ) {
    throw new TenantServiceError("validation_error");
  }

  assertOrganizationNumber(input.organizationNumber);
  assertNullableString(input.contactName, 120);
  assertNullableString(input.contactEmail, 254);
  assertNullableString(input.contactPhone, 32);
  assertNullableString(input.administrativeNote, 1000);
  assertCorrelationId(input.correlationId);
  return input;
}

export function validateStateMutationInput(
  input: TenantStateMutationInput,
): TenantStateMutationInput {
  if (
    !isRecord(input) ||
    !isUuid(input.tenantId) ||
    !isPositiveRevision(input.expectedRevision)
  ) {
    throw new TenantServiceError("validation_error");
  }

  assertCorrelationId(input.correlationId);
  return input;
}

export function validateAuditListInput(
  input: ListTenantAuditEventsInput,
): Required<Pick<ListTenantAuditEventsInput, "tenantId">> &
  ListTenantAuditEventsInput {
  if (!isRecord(input) || !isUuid(input.tenantId)) {
    throw new TenantServiceError("validation_error");
  }

  if (
    input.pageSize !== undefined &&
    (!Number.isInteger(input.pageSize) ||
      input.pageSize < 1 ||
      input.pageSize > 100)
  ) {
    throw new TenantServiceError("validation_error");
  }

  if (
    input.cursor !== undefined &&
    input.cursor !== null &&
    (!isRecord(input.cursor) ||
      !isUuid(input.cursor.id) ||
      !isTimestamp(input.cursor.occurredAt))
  ) {
    throw new TenantServiceError("validation_error");
  }

  return input;
}
