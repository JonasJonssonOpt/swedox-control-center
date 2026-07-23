"use server";

import "server-only";

import { redirect } from "next/navigation";

import { getOwnerMfaState, requireAuthorizedOwner } from "@/lib/server/auth";
import { recordMfaAuditEvent } from "@/lib/server/audit/mfa-audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ChallengeVerificationState } from "./state";

const GENERIC_VERIFICATION_ERROR =
  "Verifieringen misslyckades. Kontrollera koden och försök igen.";

async function requireChallengeState() {
  const owner = await requireAuthorizedOwner();

  const state = await getOwnerMfaState();

  switch (state.status) {
    case "unauthenticated":
      redirect("/login");
    case "not_owner":
      redirect("/auth/unauthorized");
    case "mfa_enrollment_required":
      redirect("/auth/mfa/enroll");
    case "mfa_challenge_required":
      return owner;
    case "authorized":
      redirect("/auth/owner-check");
    case "invalid_mfa_state":
      redirect("/auth/security-error");
    case "auth_unavailable":
      redirect("/auth/security-error");
    default: {
      const exhaustiveCheck: never = state;
      void exhaustiveCheck;
      redirect("/auth/security-error");
    }
  }
}

type ChallengeResult =
  | Readonly<{ status: "success" }>
  | Readonly<{ status: "verification_failed" }>
  | Readonly<{ status: "security_error" }>;

async function performChallengeVerification(
  code: string,
): Promise<ChallengeResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const factorsResult = await supabase.auth.mfa.listFactors();

    if (factorsResult.error) {
      return { status: "security_error" };
    }

    const verifiedTotpFactors = factorsResult.data.all.filter(
      (factor) => factor.factor_type === "totp" && factor.status === "verified",
    );
    const hasUnsupportedFactor = factorsResult.data.all.some(
      (factor) => factor.factor_type !== "totp",
    );

    if (hasUnsupportedFactor || verifiedTotpFactors.length !== 1) {
      return { status: "security_error" };
    }

    const factorId = verifiedTotpFactors[0].id;
    const challengeResult = await supabase.auth.mfa.challenge({ factorId });

    if (challengeResult.error) {
      return { status: "security_error" };
    }

    const verifyResult = await supabase.auth.mfa.verify({
      challengeId: challengeResult.data.id,
      code,
      factorId,
    });

    if (verifyResult.error) {
      return { status: "verification_failed" };
    }

    return { status: "success" };
  } catch {
    return { status: "security_error" };
  }
}

export async function verifyMfaChallenge(
  _previousState: ChallengeVerificationState,
  formData: FormData,
): Promise<ChallengeVerificationState> {
  const owner = await requireChallengeState();

  const codeValue = formData.get("code");

  if (typeof codeValue !== "string" || !/^\d{6}$/.test(codeValue.trim())) {
    recordMfaAuditEvent("challenge_failed", owner.userId);
    return { error: GENERIC_VERIFICATION_ERROR };
  }

  recordMfaAuditEvent("challenge_started", owner.userId);
  const result = await performChallengeVerification(codeValue.trim());

  if (result.status === "security_error") {
    recordMfaAuditEvent("challenge_failed", owner.userId);
    redirect("/auth/security-error");
  }

  if (result.status === "verification_failed") {
    recordMfaAuditEvent("challenge_failed", owner.userId);
    return { error: GENERIC_VERIFICATION_ERROR };
  }

  recordMfaAuditEvent("challenge_completed", owner.userId);
  redirect("/auth/owner-check");
}
