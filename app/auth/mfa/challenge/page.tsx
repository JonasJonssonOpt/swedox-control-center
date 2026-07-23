import { redirect } from "next/navigation";

import { getOwnerMfaState, requireAuthorizedOwner } from "@/lib/server/auth";

import { ChallengeForm } from "./challenge-form";

export default async function MfaChallengePage() {
  await requireAuthorizedOwner();

  const state = await getOwnerMfaState();

  switch (state.status) {
    case "unauthenticated":
      redirect("/login");
    case "not_owner":
      redirect("/auth/unauthorized");
    case "mfa_enrollment_required":
      redirect("/auth/mfa/enroll");
    case "mfa_challenge_required":
      break;
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
      <ChallengeForm />
    </main>
  );
}
