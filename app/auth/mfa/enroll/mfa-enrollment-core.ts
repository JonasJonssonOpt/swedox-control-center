import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

import type { EnrollmentState } from "./state";

const ENROLLMENT_FRIENDLY_NAME = "swedox-control-center-owner-totp";

type MfaClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type StartEnrollmentResult =
  | Readonly<{
      data: Extract<EnrollmentState, { status: "ready" }> &
        Readonly<{ factorId: string }>;
      status: "success";
    }>
  | Readonly<{ status: "enrollment_in_progress" }>
  | Readonly<{ status: "security_error" }>;

export async function performMfaEnrollmentStart(
  supabase: MfaClient,
  pendingFactorId?: string,
): Promise<StartEnrollmentResult> {
  const removedFactorIds = new Set<string>();
  if (pendingFactorId) {
    const { error } = await supabase.auth.mfa.unenroll({
      factorId: pendingFactorId,
    });
    if (error && error.code !== "mfa_factor_not_found") {
      return { status: "security_error" };
    }
    removedFactorIds.add(pendingFactorId);
  }

  const factorsResult = await supabase.auth.mfa.listFactors();
  if (factorsResult.error) {
    return { status: "security_error" };
  }

  const hasUnsupportedFactor = factorsResult.data.all.some(
    (factor) => factor.factor_type !== "totp",
  );
  if (hasUnsupportedFactor || factorsResult.data.totp.length > 0) {
    return { status: "security_error" };
  }

  const unverifiedTotpFactors = factorsResult.data.all.filter(
    (factor) => factor.factor_type === "totp" && factor.status === "unverified",
  );
  for (const factor of unverifiedTotpFactors) {
    if (removedFactorIds.has(factor.id)) {
      continue;
    }
    const { error } = await supabase.auth.mfa.unenroll({
      factorId: factor.id,
    });
    if (error && error.code !== "mfa_factor_not_found") {
      return { status: "security_error" };
    }
  }

  let enrollmentResult = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: ENROLLMENT_FRIENDLY_NAME,
  });
  if (enrollmentResult.error?.code === "mfa_factor_name_conflict") {
    enrollmentResult = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `${ENROLLMENT_FRIENDLY_NAME}-${crypto.randomUUID()}`,
    });
  }

  const { data, error } = enrollmentResult;
  if (error) {
    return error.code === "mfa_factor_name_conflict"
      ? { status: "enrollment_in_progress" }
      : { status: "security_error" };
  }

  if (
    !data.totp.qr_code.startsWith("data:image/svg+xml;utf-8,") ||
    data.totp.secret.length === 0
  ) {
    return { status: "security_error" };
  }

  return {
    data: Object.freeze({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      status: "ready",
    }),
    status: "success",
  };
}

export type VerifyEnrollmentResult =
  | Readonly<{ status: "success" }>
  | Readonly<{ status: "verification_failed" }>
  | Readonly<{ status: "security_error" }>;

export async function performMfaEnrollmentVerification(
  supabase: MfaClient,
  factorId: string,
  code: string,
): Promise<VerifyEnrollmentResult> {
  const factorsResult = await supabase.auth.mfa.listFactors();
  if (factorsResult.error) {
    return { status: "security_error" };
  }

  const hasUnsupportedFactor = factorsResult.data.all.some(
    (factor) => factor.factor_type !== "totp",
  );
  if (hasUnsupportedFactor || factorsResult.data.totp.length > 0) {
    return { status: "security_error" };
  }

  const challengeResult = await supabase.auth.mfa.challenge({ factorId });
  if (challengeResult.error) {
    return { status: "verification_failed" };
  }

  const verifyResult = await supabase.auth.mfa.verify({
    challengeId: challengeResult.data.id,
    code,
    factorId,
  });
  if (verifyResult.error) {
    return { status: "verification_failed" };
  }

  const assuranceResult =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceResult.error || assuranceResult.data.currentLevel !== "aal2") {
    return { status: "security_error" };
  }

  return { status: "success" };
}
