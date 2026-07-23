"use client";

import Image from "next/image";
import { useActionState } from "react";

import { startMfaEnrollment, verifyMfaEnrollment } from "./actions";
import { INITIAL_ENROLLMENT_STATE, INITIAL_VERIFICATION_STATE } from "./state";

function VerificationForm() {
  const [state, action, pending] = useActionState(
    verifyMfaEnrollment,
    INITIAL_VERIFICATION_STATE,
  );

  return (
    <form action={action}>
      <label htmlFor="code">Kod från Microsoft Authenticator</label>
      <input
        autoComplete="one-time-code"
        id="code"
        inputMode="numeric"
        maxLength={6}
        name="code"
        pattern="[0-9]{6}"
        required
      />
      {state.error ? <p>{state.error}</p> : null}
      <button disabled={pending} type="submit">
        {pending ? "Verifierar…" : "Verifiera"}
      </button>
    </form>
  );
}

export function EnrollmentForm() {
  const [state, action, pending] = useActionState(
    startMfaEnrollment,
    INITIAL_ENROLLMENT_STATE,
  );

  if (state?.status === "ready") {
    return (
      <>
        <p>Skanna QR-koden med Microsoft Authenticator.</p>
        <Image
          alt="QR-kod för Microsoft Authenticator"
          height={256}
          src={state.qrCode}
          unoptimized
          width={256}
        />
        <VerificationForm />
      </>
    );
  }

  return (
    <form action={action}>
      {state?.status === "error" ? <p>{state.error}</p> : null}
      <button disabled={pending} type="submit">
        {pending ? "Förbereder…" : "Konfigurera Microsoft Authenticator"}
      </button>
    </form>
  );
}
