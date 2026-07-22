"use client";

import { useActionState } from "react";

import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div>
        <label
          className="block text-sm font-medium text-stone-800"
          htmlFor="email"
        >
          E-post
        </label>
        <input
          autoComplete="username"
          className="mt-2 block w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-stone-950 shadow-sm outline-none transition focus:border-stone-600 focus:ring-2 focus:ring-stone-200"
          disabled={isPending}
          id="email"
          name="email"
          required
          type="email"
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium text-stone-800"
          htmlFor="password"
        >
          Lösenord
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 block w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-stone-950 shadow-sm outline-none transition focus:border-stone-600 focus:ring-2 focus:ring-stone-200"
          disabled={isPending}
          id="password"
          name="password"
          required
          type="password"
        />
      </div>

      <p
        aria-live="polite"
        className="min-h-5 text-sm text-red-700"
        role={state.error ? "alert" : undefined}
      >
        {state.error}
      </p>

      <button
        className="w-full rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Loggar in…" : "Logga in"}
      </button>
    </form>
  );
}
