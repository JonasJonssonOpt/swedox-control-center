import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Autentisering pågår | SweDox Control Center",
};

export default function AuthPendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      {/* This temporary route is public and must not be treated as authorized access. */}
      <section className="w-full max-w-lg rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-stone-500">Internt system</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Första autentiseringssteget är klart
        </h1>
        <p className="mt-4 text-stone-700">
          Detta är en tillfällig, publik bekräftelsesida. Fullständig åtkomst,
          owner-verifiering och MFA är inte implementerade ännu.
        </p>
      </section>
    </main>
  );
}
