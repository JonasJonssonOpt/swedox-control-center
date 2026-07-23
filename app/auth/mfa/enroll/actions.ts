"use server";

import "server-only";

import { redirect } from "next/navigation";

import { getOwnerMfaState, requireAuthorizedOwner } from "@/lib/server/auth";
import { recordMfaAuditEvent } from "@/lib/server/audit/mfa-audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { EnrollmentState, EnrollmentVerificationState } from "./state";

const GENERIC_VERIFICATION_ERROR =
  "Verifieringen misslyckades. Kontrollera koden och försök igen.";
const ENROLLMENT_IN_PROGRESS_ERROR =
  "En registrering pågår redan. Försök igen.";
const ENROLLMENT_FRIENDLY_NAME = "swedox-control-center-owner-totp";
const ENROLLMENT_LOCK_MAX_AGE_MS = 10 * 60 * 1000;

async function requireEnrollmentState() {
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

type StartEnrollmentResult =
  | Readonly<{
      data: Extract<EnrollmentState, { status: "ready" }>;
      status: "success";
    }>
  | Readonly<{ status: "enrollment_in_progress" }>
  | Readonly<{ status: "security_error" }>;

function isActiveEnrollmentLock(createdAt: string): boolean {
  const createdAtMs = Date.parse(createdAt);

  if (!Number.isFinite(createdAtMs)) {
    return true;
  }

  return Date.now() - createdAtMs < ENROLLMENT_LOCK_MAX_AGE_MS;
}

async function performEnrollmentStart(): Promise<StartEnrollmentResult> {
  try {
    const supabase = await createSupabaseServerClient();
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
      (factor) =>
        factor.factor_type === "totp" && factor.status === "unverified",
    );
    const hasActiveEnrollmentLock = unverifiedTotpFactors.some(
      (factor) =>
        factor.friendly_name === ENROLLMENT_FRIENDLY_NAME &&
        isActiveEnrollmentLock(factor.created_at),
    );

    if (hasActiveEnrollmentLock) {
      return { status: "enrollment_in_progress" };
    }

    for (const factor of unverifiedTotpFactors) {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: factor.id,
      });

      if (error) {
        if (error.code === "mfa_factor_not_found") {
          return { status: "enrollment_in_progress" };
        }

        return { status: "security_error" };
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: ENROLLMENT_FRIENDLY_NAME,
    });

    if (error) {
      if (error.code === "mfa_factor_name_conflict") {
        return { status: "enrollment_in_progress" };
      }

      return { status: "security_error" };
    }

    return {
      data: Object.freeze({
        qrCode: data.totp.qr_code,
        status: "ready",
      }),
      status: "success",
    };
  } catch {
    return { status: "security_error" };
  }
}

export async function startMfaEnrollment(
  _previousState: EnrollmentState,
  _formData: FormData,
): Promise<EnrollmentState> {
  void _previousState;
  void _formData;

  const owner = await requireEnrollmentState();
  recordMfaAuditEvent("enrollment_started", owner.userId);

  const result = await performEnrollmentStart();

  if (result.status === "security_error") {
    recordMfaAuditEvent("enrollment_failed", owner.userId);
    redirect("/auth/security-error");
  }

  if (result.status === "enrollment_in_progress") {
    recordMfaAuditEvent("enrollment_failed", owner.userId);
    return {
      error: ENROLLMENT_IN_PROGRESS_ERROR,
      status: "error",
    };
  }

  return result.data;
}

type VerifyEnrollmentResult =
  | Readonly<{ status: "success" }>
  | Readonly<{ status: "verification_failed" }>
  | Readonly<{ status: "security_error" }>;

async function performEnrollmentVerification(
  code: string,
): Promise<VerifyEnrollmentResult> {
  try {
    const supabase = await createSupabaseServerClient();
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
      (factor) =>
        factor.factor_type === "totp" && factor.status === "unverified",
    );

    if (unverifiedTotpFactors.length !== 1) {
      return { status: "security_error" };
    }

    const factorId = unverifiedTotpFactors[0].id;
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

export async function verifyMfaEnrollment(
  _previousState: EnrollmentVerificationState,
  formData: FormData,
): Promise<EnrollmentVerificationState> {
  const owner = await requireEnrollmentState();

  const codeValue = formData.get("code");

  if (typeof codeValue !== "string" || !/^\d{6}$/.test(codeValue.trim())) {
    recordMfaAuditEvent("enrollment_failed", owner.userId);
    return { error: GENERIC_VERIFICATION_ERROR };
  }

  const result = await performEnrollmentVerification(codeValue.trim());

  if (result.status === "security_error") {
    recordMfaAuditEvent("enrollment_failed", owner.userId);
    redirect("/auth/security-error");
  }

  if (result.status === "verification_failed") {
    recordMfaAuditEvent("enrollment_failed", owner.userId);
    return { error: GENERIC_VERIFICATION_ERROR };
  }

  recordMfaAuditEvent("enrollment_completed", owner.userId);
  redirect("/auth/owner-check");
}
