import "server-only";

import { redirect } from "next/navigation";

import { getOwnerMfaState, requireAuthorizedOwner } from "@/lib/server/auth";
import { recordMfaAuditEvent } from "@/lib/server/audit/mfa-audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { performMfaEnrollmentStart } from "./mfa-enrollment-core";
import { getPendingMfaFactorId, setPendingMfaFactorId } from "./pending-factor";
import type { EnrollmentState } from "./state";

const ENROLLMENT_IN_PROGRESS_ERROR =
  "En registrering pågår redan. Försök igen.";
const GENERIC_ENROLLMENT_ERROR =
  "Microsoft Authenticator kunde inte konfigureras. Försök igen.";

export async function requireMfaEnrollmentState() {
  const owner = await requireAuthorizedOwner();
  const state = await getOwnerMfaState();

  switch (state.status) {
    case "unauthenticated":
      redirect("/login");
    case "not_owner":
      redirect("/auth/unauthorized");
    case "mfa_enrollment_required":
      return owner;
    case "mfa_challenge_required":
      redirect("/auth/mfa/challenge");
    case "authorized":
      redirect("/auth/owner-check");
    case "invalid_mfa_state":
    case "auth_unavailable":
      redirect("/auth/security-error");
    default: {
      const exhaustiveCheck: never = state;
      void exhaustiveCheck;
      redirect("/auth/security-error");
    }
  }
}

export async function initializeMfaEnrollment(): Promise<EnrollmentState> {
  const owner = await requireMfaEnrollmentState();
  recordMfaAuditEvent("enrollment_started", owner.userId);

  try {
    const supabase = await createSupabaseServerClient();
    const pendingFactorId = await getPendingMfaFactorId();
    const result = await performMfaEnrollmentStart(supabase, pendingFactorId);

    if (result.status === "success") {
      await setPendingMfaFactorId(result.data.factorId);
      return {
        qrCode: result.data.qrCode,
        secret: result.data.secret,
        status: "ready",
      };
    }

    recordMfaAuditEvent("enrollment_failed", owner.userId);
    return {
      error:
        result.status === "enrollment_in_progress"
          ? ENROLLMENT_IN_PROGRESS_ERROR
          : GENERIC_ENROLLMENT_ERROR,
      status: "error",
    };
  } catch {
    recordMfaAuditEvent("enrollment_failed", owner.userId);
    return { error: GENERIC_ENROLLMENT_ERROR, status: "error" };
  }
}
