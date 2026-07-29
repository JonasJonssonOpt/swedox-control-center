import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";

import {
  getInstallationById,
  InstallationServiceError,
} from "@/lib/server/installations";

import { InstallationForm } from "../../installation-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Redigera installation | SweDox Control Center",
};

export default async function EditInstallationPage({
  params,
}: Readonly<{ params: Promise<{ installationId: string }> }>) {
  const { installationId } = await params;
  let installation;
  try {
    installation = await getInstallationById(installationId);
  } catch (error) {
    unstable_rethrow(error);
    if (
      error instanceof InstallationServiceError &&
      error.code === "not_found"
    ) {
      notFound();
    }
    throw error;
  }

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
        <Link
          className="rounded-sm text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          href={`/installations/${installation.id}`}
        >
          Detail
        </Link>
        <span aria-hidden="true" className="mx-2 text-stone-400">
          /
        </span>
        <span aria-current="page">Redigera</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
          Redigera {installation.displayName}
        </h1>
      </header>

      {installation.archivedAt !== null ? (
        <section className="rounded-lg border border-stone-300 bg-white p-6">
          <h2 className="text-base font-semibold text-stone-950">
            Arkiverad installation kan inte redigeras
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Återställ installationen innan uppgifterna kan ändras.
          </p>
          <Link
            className="mt-5 inline-block rounded-sm text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href={`/installations/${installation.id}`}
          >
            Till installationsdetail
          </Link>
        </section>
      ) : (
        <InstallationForm
          initialValues={{
            administrativeNote: installation.administrativeNote ?? "",
            administrativeStatus: installation.administrativeStatus,
            applicationUrl: installation.applicationUrl ?? "",
            displayName: installation.displayName,
            environment: installation.environment,
            expectedRevision: installation.revision,
            hostingRegion: installation.hostingRegion ?? "",
            installationCode: installation.installationCode,
            installationId: installation.id,
            supabaseProjectRef: installation.supabaseProjectRef ?? "",
            tenantId: installation.tenantId,
            tenantLegalName: installation.tenantLegalName,
          }}
          mode="edit"
          tenantOptions={[]}
        />
      )}
    </div>
  );
}
