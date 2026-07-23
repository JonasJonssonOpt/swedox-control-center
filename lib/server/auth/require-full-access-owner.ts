import "server-only";

import { redirect } from "next/navigation";

import { getOwnerMfaState } from "./get-owner-mfa-state";

export type FullAccessOwner = Readonly<{
  aal: "aal2";
  role: "owner";
  userId: string;
}>;

export async function requireFullAccessOwner(): Promise<FullAccessOwner> {
  const state = await getOwnerMfaState();

  switch (state.status) {
    case "unauthenticated":
      redirect("/login");
    case "not_owner":
      redirect("/auth/unauthorized");
    case "mfa_enrollment_required":
      redirect("/auth/mfa/enroll");
    case "mfa_challenge_required":
      redirect("/auth/mfa/challenge");
    case "authorized":
      return {
        aal: "aal2",
        role: "owner",
        userId: state.userId,
      };
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
