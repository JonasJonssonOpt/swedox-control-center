"use server";

import "server-only";

import { redirect } from "next/navigation";

import { recordMfaAuditEvent } from "@/lib/server/audit/mfa-audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  initializeMfaEnrollment,
  requireMfaEnrollmentState,
} from "./enrollment-server";
import {
  performMfaEnrollmentVerification,
  type VerifyEnrollmentResult,
} from "./mfa-enrollment-core";
import {
  clearPendingMfaFactorId,
  getPendingMfaFactorId,
} from "./pending-factor";
import type { EnrollmentState, EnrollmentVerificationState } from "./state";

const GENERIC_VERIFICATION_ERROR =
  "Verifieringen misslyckades. Kontrollera koden och försök igen.";

export async function startMfaEnrollment(
  _previousState: EnrollmentState,
  _formData: FormData,
): Promise<EnrollmentState> {
  void _previousState;
  void _formData;
  return initializeMfaEnrollment();
}

async function performEnrollmentVerification(
  factorId: string,
  code: string,
): Promise<VerifyEnrollmentResult> {
  try {
    const supabase = await createSupabaseServerClient();
    return await performMfaEnrollmentVerification(supabase, factorId, code);
  } catch {
    return { status: "security_error" };
  }
}

export async function verifyMfaEnrollment(
  _previousState: EnrollmentVerificationState,
  formData: FormData,
): Promise<EnrollmentVerificationState> {
  const owner = await requireMfaEnrollmentState();
  const codeValue = formData.get("code");

  if (typeof codeValue !== "string" || !/^\d{6}$/.test(codeValue.trim())) {
    recordMfaAuditEvent("enrollment_failed", owner.userId);
    return { error: GENERIC_VERIFICATION_ERROR };
  }

  const factorId = await getPendingMfaFactorId();
  if (!factorId) {
    recordMfaAuditEvent("enrollment_failed", owner.userId);
    return { error: GENERIC_VERIFICATION_ERROR };
  }

  const result = await performEnrollmentVerification(
    factorId,
    codeValue.trim(),
  );
  if (result.status !== "success") {
    recordMfaAuditEvent("enrollment_failed", owner.userId);
    return { error: GENERIC_VERIFICATION_ERROR };
  }

  await clearPendingMfaFactorId();
  recordMfaAuditEvent("enrollment_completed", owner.userId);
  redirect("/tenants");
}
