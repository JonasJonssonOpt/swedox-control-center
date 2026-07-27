import type { Metadata } from "next";
import Link from "next/link";

import { requireOwnerIntegrity } from "@/lib/server/auth";

import { TenantForm } from "../tenant-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Skapa tenant | SweDox Control Center",
};

export default async function NewTenantPage() {
  await requireOwnerIntegrity();

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10 lg:px-8">
      <nav aria-label="Brödsmulor" className="mb-6 text-sm">
        <Link
          className="rounded-sm text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          href="/tenants"
        >
          Tenants
        </Link>
        <span aria-hidden="true" className="mx-2 text-stone-400">
          /
        </span>
        <span aria-current="page">Skapa</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
          Skapa tenant
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Lägg till identitets-, kontakt- och administrationsuppgifter.
        </p>
      </header>

      <TenantForm
        initialValues={{
          administrativeNote: "",
          category: "customer",
          contactEmail: "",
          contactName: "",
          contactPhone: "",
          legalName: "",
          organizationNumber: "",
        }}
        mode="create"
      />
    </main>
  );
}
