import "server-only";

import { randomUUID } from "node:crypto";

export const INSTALLATION_SERVICE_ERROR_CODES = [
  "unauthorized",
  "not_found",
  "conflict",
  "validation_error",
  "invalid_state_transition",
  "tenant_not_available",
  "duplicate_installation",
  "audit_failure",
  "unexpected_error",
] as const;

export type InstallationServiceErrorCode =
  (typeof INSTALLATION_SERVICE_ERROR_CODES)[number];

export class InstallationServiceError extends Error {
  readonly code: InstallationServiceErrorCode;

  constructor(code: InstallationServiceErrorCode) {
    super(code);
    this.name = "InstallationServiceError";
    this.code = code;
  }
}

export function recordUnexpectedInstallationError(): string {
  const correlationId = randomUUID();
  try {
    console.error(
      JSON.stringify({
        code: "unexpected_error",
        correlationId,
        event: "installation_service_failed",
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    try {
      console.error("[installation.service.log_failed]");
    } catch {
      // Logging must never alter the fail-closed result.
    }
  }
  return correlationId;
}

export function mapInstallationDatabaseError(
  error: unknown,
): InstallationServiceError {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? error.message
      : undefined;
  const stableCode = INSTALLATION_SERVICE_ERROR_CODES.find(
    (code) => code !== "unexpected_error" && message === code,
  );
  if (stableCode) return new InstallationServiceError(stableCode);
  recordUnexpectedInstallationError();
  return new InstallationServiceError("unexpected_error");
}
