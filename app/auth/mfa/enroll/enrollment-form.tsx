"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

import { startMfaEnrollment, verifyMfaEnrollment } from "./actions";
import { INITIAL_VERIFICATION_STATE, type EnrollmentState } from "./state";

function VerificationForm() {
  const [state, action, pending] = useActionState(
    verifyMfaEnrollment,
    INITIAL_VERIFICATION_STATE,
  );

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label
          className="block text-sm font-medium text-stone-800"
          htmlFor="code"
        >
          Kod från Microsoft Authenticator
        </label>
        <input
          aria-describedby={state.error ? "mfa-code-error" : "mfa-code-help"}
          aria-invalid={state.error ? true : undefined}
          autoComplete="one-time-code"
          className="mt-2 block w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-stone-950 shadow-sm outline-none transition focus:border-stone-600 focus:ring-2 focus:ring-stone-200 disabled:cursor-not-allowed disabled:bg-stone-100"
          disabled={pending}
          id="code"
          inputMode="numeric"
          maxLength={6}
          name="code"
          pattern="[0-9]{6}"
          required
        />
        <p className="mt-2 text-sm text-stone-600" id="mfa-code-help">
          Ange exakt sex siffror.
        </p>
        {state.error ? (
          <p
            className="mt-2 text-sm text-red-700"
            id="mfa-code-error"
            role="alert"
          >
            {state.error}
          </p>
        ) : null}
      </div>
      <button
        className="w-full rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:cursor-not-allowed disabled:bg-stone-400"
        disabled={pending}
        type="submit"
      >
        {pending ? "Verifierar…" : "Verifiera"}
      </button>
    </form>
  );
}

export function EnrollmentForm({
  initialState,
}: Readonly<{ initialState: EnrollmentState }>) {
  const [state, action, pending] = useActionState(
    startMfaEnrollment,
    initialState,
  );
  const enrollmentStarted = useRef(false);

  useEffect(() => {
    if (initialState.status !== "loading" || enrollmentStarted.current) {
      return;
    }

    enrollmentStarted.current = true;
    startTransition(() => action(new FormData()));
  }, [action, initialState.status]);

  if (state.status === "ready") {
    return (
      <div className="mt-6">
        <p className="text-sm text-stone-700">
          Skanna QR-koden med Microsoft Authenticator.
        </p>
        {/* Supabase returns this TOTP QR code as an SVG data URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="QR-kod för Microsoft Authenticator"
          className="mx-auto mt-4"
          height={256}
          src={state.qrCode}
          width={256}
        />
        <div className="mt-5">
          <p className="text-sm font-medium text-stone-800">
            Manuell setup-nyckel
          </p>
          <code className="mt-2 block break-all rounded-md bg-stone-100 p-3 text-sm text-stone-950">
            {state.secret}
          </code>
          <p className="mt-2 text-sm text-stone-600">
            Nyckeln är känslig. Dela eller spara den inte utanför din
            autentiseringsapp.
          </p>
        </div>
        <VerificationForm />
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <p aria-live="polite" className="mt-6 text-sm text-stone-600">
        Förbereder Microsoft Authenticator…
      </p>
    );
  }

  return (
    <form action={action} className="mt-6">
      <p className="text-sm text-red-700" role="alert">
        {state.error}
      </p>
      <button
        className="mt-4 w-full rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:cursor-not-allowed disabled:text-stone-400"
        disabled={pending}
        type="submit"
      >
        {pending ? "Förbereder…" : "Försök igen"}
      </button>
    </form>
  );
}
