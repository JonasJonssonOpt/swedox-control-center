import "server-only";

import { randomUUID } from "node:crypto";

export const LICENSE_SERVICE_ERROR_CODES = [
  "unauthorized",
  "not_found",
  "conflict",
  "validation_error",
  "invalid_state_transition",
  "tenant_not_available",
  "duplicate_license",
  "audit_failure",
  "unexpected_error",
] as const;

export type LicenseServiceErrorCode =
  (typeof LICENSE_SERVICE_ERROR_CODES)[number];

export class LicenseServiceError extends Error {
  readonly code: LicenseServiceErrorCode;

  constructor(code: LicenseServiceErrorCode) {
    super(code);
    this.name = "LicenseServiceError";
    this.code = code;
  }
}

// Safe category, time and correlation only: no claims, actor, values or SQL.
export function recordUnexpectedLicenseError(
  event = "license_service_failed",
): string {
  const correlationId = randomUUID();
  try {
    console.error(
      JSON.stringify({
        code: "unexpected_error",
        correlationId,
        event,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    try {
      console.error("[license.service.log_failed]");
    } catch {
      // Logging must never alter the fail-closed result.
    }
  }
  return correlationId;
}

export function mapLicenseDatabaseError(error: unknown): LicenseServiceError {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? error.message
      : undefined;
  const stableCode = LICENSE_SERVICE_ERROR_CODES.find(
    (code) => code !== "unexpected_error" && message === code,
  );
  if (stableCode) return new LicenseServiceError(stableCode);
  recordUnexpectedLicenseError();
  return new LicenseServiceError("unexpected_error");
}
