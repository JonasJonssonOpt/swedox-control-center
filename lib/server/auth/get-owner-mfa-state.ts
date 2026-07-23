import "server-only";

import { recordMfaAuditEvent } from "@/lib/server/audit/mfa-audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getOwnerAuthorization } from "./get-owner-authorization";

type OwnerIdentity = Readonly<{
  role: "owner";
  userId: string;
}>;

export type OwnerMfaState =
  | Readonly<{ status: "unauthenticated" }>
  | Readonly<{ status: "not_owner" }>
  | Readonly<
      OwnerIdentity & {
        status: "mfa_enrollment_required";
      }
    >
  | Readonly<
      OwnerIdentity & {
        status: "mfa_challenge_required";
      }
    >
  | Readonly<
      OwnerIdentity & {
        aal: "aal2";
        status: "authorized";
      }
    >
  | Readonly<{ status: "invalid_mfa_state" }>
  | Readonly<{ status: "auth_unavailable" }>;

function auditedMfaFailure(
  status: "auth_unavailable" | "invalid_mfa_state",
  userId: string,
): OwnerMfaState {
  recordMfaAuditEvent(status, userId);
  return { status };
}

export async function getOwnerMfaState(): Promise<OwnerMfaState> {
  const ownerAuthorization = await getOwnerAuthorization();

  if (ownerAuthorization.status !== "authorized") {
    return { status: ownerAuthorization.status };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const [factorsResult, assuranceResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);

    if (factorsResult.error || assuranceResult.error) {
      return auditedMfaFailure("auth_unavailable", ownerAuthorization.userId);
    }

    const { all, totp } = factorsResult.data;
    const { currentLevel, nextLevel } = assuranceResult.data;
    const hasUnsupportedFactor = all.some(
      (factor) => factor.factor_type !== "totp",
    );

    if (hasUnsupportedFactor || totp.length > 1) {
      return auditedMfaFailure("invalid_mfa_state", ownerAuthorization.userId);
    }

    const owner = {
      role: ownerAuthorization.role,
      userId: ownerAuthorization.userId,
    } as const;

    if (
      totp.length === 0 &&
      (ownerAuthorization.aal === "aal1" || ownerAuthorization.aal === null) &&
      currentLevel === "aal1" &&
      nextLevel === "aal1"
    ) {
      return Object.freeze({
        ...owner,
        status: "mfa_enrollment_required",
      });
    }

    if (
      totp.length === 1 &&
      (ownerAuthorization.aal === "aal1" || ownerAuthorization.aal === null) &&
      currentLevel === "aal1" &&
      nextLevel === "aal2"
    ) {
      return Object.freeze({
        ...owner,
        status: "mfa_challenge_required",
      });
    }

    if (
      totp.length === 1 &&
      ownerAuthorization.aal === "aal2" &&
      currentLevel === "aal2" &&
      nextLevel === "aal2"
    ) {
      return Object.freeze({
        ...owner,
        aal: "aal2",
        status: "authorized",
      });
    }

    return auditedMfaFailure("invalid_mfa_state", ownerAuthorization.userId);
  } catch {
    return auditedMfaFailure("auth_unavailable", ownerAuthorization.userId);
  }
}
