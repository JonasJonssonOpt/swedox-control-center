import "server-only";

import { randomUUID } from "node:crypto";

import {
  createOwnerIntegrityLogEntry,
  type OwnerIntegrityFailureCode,
} from "./owner-integrity.contract";

export function recordOwnerIntegrityFailure(
  code: OwnerIntegrityFailureCode,
): string {
  const correlationId = randomUUID();

  try {
    console.error(
      JSON.stringify(
        createOwnerIntegrityLogEntry(
          code,
          correlationId,
          new Date().toISOString(),
        ),
      ),
    );
  } catch {
    try {
      console.error("[owner_integrity.log_failed]");
    } catch {
      // Logging must not change the fail-closed security outcome.
    }
  }

  return correlationId;
}
