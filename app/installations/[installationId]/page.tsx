import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";

import {
  getInstallationById,
  InstallationServiceError,
  listInstallationAuditEvents,
} from "@/lib/server/installations";
import { parseInstallationAuditPage } from "@/lib/installations/installation-audit-presentation";

import { InstallationDetail } from "../installation-detail";
import { InstallationAuditHistory } from "./installation-audit-history";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Installationdetail | SweDox Control Center",
};

export default async function InstallationDetailPage({
  params,
}: Readonly<{ params: Promise<{ installationId: string }> }>) {
  const { installationId } = await params;
  let installation;
  let auditPage;
  try {
    installation = await getInstallationById(installationId);
    auditPage = parseInstallationAuditPage(
      await listInstallationAuditEvents({ installationId, pageSize: 25 }),
      installationId,
    );
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
    <div className="mx-auto w-full max-w-5xl">
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
        <span aria-current="page" className="text-stone-900">
          Detail
        </span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-stone-500">
            Installationdetail
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">
            {installation.displayName}
          </h1>
          <Link
            className="mt-3 inline-block rounded-sm text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href="/installations"
          >
            Till installationslistan
          </Link>
        </div>
        {installation.archivedAt === null ? (
          <Link
            className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href={`/installations/${installation.id}/edit`}
          >
            Redigera
          </Link>
        ) : null}
      </header>

      <InstallationDetail installation={installation} />
      <div className="mt-5">
        <InstallationAuditHistory
          initialPage={auditPage}
          installationId={installationId}
          key={`installation-audit-revision-${installation.revision}`}
        />
      </div>
    </div>
  );
}
