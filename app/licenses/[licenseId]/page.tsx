import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";

import {
  parseLicenseAuditPage,
  parseLicenseTermsPage,
} from "@/lib/licenses/license-presentation";
import {
  getLicense,
  LicenseServiceError,
  listLicenseAuditEvents,
  listLicenseTermsVersions,
} from "@/lib/server/licenses";

import { LicenseDetail } from "../license-detail";
import { LicenseAuditHistory } from "./license-audit-history";
import { LicenseTermsHistory } from "./license-terms-history";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Licensdetail | SweDox Control Center",
};

export default async function LicenseDetailPage({
  params,
}: Readonly<{ params: Promise<{ licenseId: string }> }>) {
  const { licenseId } = await params;
  let license;
  let termsPage;
  let auditPage;
  try {
    license = await getLicense(licenseId);
    // Parsing copies an allowlist: actor and correlation never reach the client.
    [termsPage, auditPage] = await Promise.all([
      listLicenseTermsVersions({ licenseId, pageSize: 25 }).then((page) =>
        parseLicenseTermsPage(page, licenseId),
      ),
      listLicenseAuditEvents({ licenseId, pageSize: 25 }).then((page) =>
        parseLicenseAuditPage(page, licenseId),
      ),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    if (
      error instanceof LicenseServiceError &&
      (error.code === "not_found" || error.code === "validation_error")
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
          href="/licenses"
        >
          Licenser
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
          <p className="text-sm font-medium text-stone-500">Licensdetail</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">
            {license.tenantLegalName}
          </h1>
          <Link
            className="mt-3 inline-block rounded-sm text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href="/licenses"
          >
            Till licenslistan
          </Link>
        </div>
        {license.status !== "terminated" ? (
          <Link
            className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href={`/licenses/${license.id}/edit`}
          >
            Ändra villkor
          </Link>
        ) : null}
      </header>

      <LicenseDetail license={license} />
      <div className="mt-5 space-y-5">
        <LicenseTermsHistory
          currentVersion={license.currentTermsVersion}
          initialPage={termsPage}
          key={`license-terms-revision-${license.revision}`}
          licenseId={license.id}
        />
        <LicenseAuditHistory
          initialPage={auditPage}
          key={`license-audit-revision-${license.revision}`}
          licenseId={license.id}
        />
      </div>
    </div>
  );
}
