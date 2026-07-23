import { redirect } from "next/navigation";

import { getOwnerMfaState, requireAuthorizedOwner } from "@/lib/server/auth";

import { EnrollmentForm } from "./enrollment-form";

export default async function MfaEnrollmentPage() {
  await requireAuthorizedOwner();

  const state = await getOwnerMfaState();

  switch (state.status) {
    case "unauthenticated":
      redirect("/login");
    case "not_owner":
      redirect("/auth/unauthorized");
    case "mfa_enrollment_required":
      break;
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

  return (
    <main>
      <EnrollmentForm />
    </main>
  );
}
