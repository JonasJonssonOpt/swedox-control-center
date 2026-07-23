import "server-only";

export type MfaAuditEvent =
  | "enrollment_started"
  | "enrollment_completed"
  | "enrollment_failed"
  | "challenge_started"
  | "challenge_completed"
  | "challenge_failed"
  | "invalid_mfa_state"
  | "auth_unavailable"
  | "logout_completed"
  | "logout_failed";

type MfaAuditResult = "attempt" | "failure" | "success";

const EVENT_RESULTS: Readonly<Record<MfaAuditEvent, MfaAuditResult>> = {
  auth_unavailable: "failure",
  challenge_completed: "success",
  challenge_failed: "failure",
  challenge_started: "attempt",
  enrollment_completed: "success",
  enrollment_failed: "failure",
  enrollment_started: "attempt",
  invalid_mfa_state: "failure",
  logout_completed: "success",
  logout_failed: "failure",
};

export function recordMfaAuditEvent(
  event: MfaAuditEvent,
  userId: string,
): void {
  try {
    console.info(
      JSON.stringify({
        event,
        result: EVENT_RESULTS[event],
        timestamp: new Date().toISOString(),
        userId,
      }),
    );
  } catch {
    try {
      console.error("[mfa.audit.write_failed]");
    } catch {
      // Audit failures must never interrupt authentication.
    }
  }
}
