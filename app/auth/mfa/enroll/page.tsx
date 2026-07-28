import { redirect } from "next/navigation";

import { getOwnerMfaState, requireAuthorizedOwner } from "@/lib/server/auth";

import { EnrollmentForm } from "./enrollment-form";
import { INITIAL_ENROLLMENT_STATE } from "./state";

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
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-stone-500">Kontosäkerhet</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
          Konfigurera Microsoft Authenticator
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Skanna QR-koden eller ange den manuella nyckeln och bekräfta sedan
          konfigurationen med en sexsiffrig kod.
        </p>
        <EnrollmentForm initialState={INITIAL_ENROLLMENT_STATE} />
      </section>
    </main>
  );
}
