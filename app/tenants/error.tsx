"use client";

import Link from "next/link";

export default function TenantError() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 lg:px-8">
      <h1 className="text-2xl font-semibold text-stone-950">
        Tenantdata kunde inte visas
      </h1>
      <p className="mt-3 text-sm text-stone-600">
        Ett oväntat fel inträffade. Försök igen senare.
      </p>
      <Link
        className="mt-6 inline-block rounded-sm text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        href="/tenants"
      >
        Till tenantlistan
      </Link>
    </main>
  );
}
