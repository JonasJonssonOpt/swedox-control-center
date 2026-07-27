import "server-only";

import { randomUUID } from "node:crypto";

export const TENANT_SERVICE_ERROR_CODES = [
  "unauthorized",
  "not_found",
  "conflict",
  "invalid_state_transition",
  "validation_error",
  "audit_failure",
  "unexpected_error",
] as const;

export type TenantServiceErrorCode =
  (typeof TENANT_SERVICE_ERROR_CODES)[number];

export class TenantServiceError extends Error {
  readonly code: TenantServiceErrorCode;

  constructor(code: TenantServiceErrorCode) {
    super(code);
    this.name = "TenantServiceError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mapTenantDatabaseError(error: unknown): TenantServiceError {
  const message = isRecord(error) ? error.message : undefined;
  const stableCode = TENANT_SERVICE_ERROR_CODES.find(
    (code) => code !== "unexpected_error" && message === code,
  );

  if (stableCode) {
    return new TenantServiceError(stableCode);
  }

  recordUnexpectedTenantError();
  return new TenantServiceError("unexpected_error");
}

export function recordUnexpectedTenantError(): string {
  const correlationId = randomUUID();

  try {
    console.error(
      JSON.stringify({
        code: "unexpected_error",
        correlationId,
        event: "tenant_service_failed",
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    try {
      console.error("[tenant.service.log_failed]");
    } catch {
      // Logging must never change the fail-closed result.
    }
  }

  return correlationId;
}
