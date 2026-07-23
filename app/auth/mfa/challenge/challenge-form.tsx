"use client";

import { useActionState } from "react";

import { verifyMfaChallenge } from "./actions";
import { INITIAL_CHALLENGE_STATE } from "./state";

export function ChallengeForm() {
  const [state, action, pending] = useActionState(
    verifyMfaChallenge,
    INITIAL_CHALLENGE_STATE,
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
