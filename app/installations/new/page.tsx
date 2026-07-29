import type { Metadata } from "next";
import Link from "next/link";

import { listTenants } from "@/lib/server/tenants";

import { InstallationForm } from "../installation-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Skapa installation | SweDox Control Center",
};

export default async function NewInstallationPage() {
  const tenants = (await listTenants()).filter(
    (tenant) =>
      tenant.operationalStatus === "active" && tenant.archivedAt === null,
  );

  return (
    <div className="mx-auto w-full max-w-4xl">
      <nav aria-label="Brödsmulor" className="mb-6 text-sm">
        <Link
          className="rounded-sm text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          href="/installations"
        >
          Installationer
        </Link>
        <span aria-hidden="true" className="mx-2 text-stone-400">
          /
        </span>
        <span aria-current="page">Skapa</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
          Skapa installation
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Registrera installationens identitet och tekniska metadata.
        </p>
      </header>

      {tenants.length === 0 ? (
        <section className="rounded-lg border border-stone-300 bg-white p-6">
          <h2 className="text-base font-semibold text-stone-950">
            Ingen aktiv tenant är tillgänglig
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            En installation måste kopplas till en aktiv, icke arkiverad tenant.
          </p>
          <Link
            className="mt-5 inline-block rounded-sm text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href="/installations"
          >
            Till installationslistan
          </Link>
        </section>
      ) : (
        <InstallationForm
          initialValues={{
            administrativeNote: "",
            applicationUrl: "",
            displayName: "",
            environment: "production",
            hostingRegion: "",
            installationCode: "",
            supabaseProjectRef: "",
            tenantId: "",
          }}
          mode="create"
          tenantOptions={tenants.map((tenant) => ({
            id: tenant.id,
            legalName: tenant.legalName,
          }))}
        />
      )}
    </div>
  );
}
