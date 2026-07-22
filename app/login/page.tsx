import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Logga in | SweDox Control Center",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-stone-500">Internt system</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          SweDox Control Center
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Logga in med ditt interna konto.
        </p>

        <LoginForm />
      </section>
    </main>
  );
}
