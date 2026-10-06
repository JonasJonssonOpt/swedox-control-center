import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";

import { toStockholmInputValue } from "@/lib/licenses/license-presentation";
import { getLicense, LicenseServiceError } from "@/lib/server/licenses";

import { LicenseForm } from "../../license-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Ändra licensvillkor | SweDox Control Center",
};

export default async function EditLicensePage({
  params,
}: Readonly<{ params: Promise<{ licenseId: string }> }>) {
  const { licenseId } = await params;
  let license;
  try {
    license = await getLicense(licenseId);
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
  const isDraft = license.status === "draft";
  // A draft start already reached cannot be resubmitted (no backdating), so
  // the field starts empty and means "from the save time".
  const futureStart =
    isDraft && license.validity === "not_started"
      ? toStockholmInputValue(license.validFrom)
      : "";

  return (
    <div className="mx-auto w-full max-w-4xl">
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
        <Link
          className="rounded-sm text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          href={`/licenses/${license.id}`}
        >
          {license.tenantLegalName}
        </Link>
        <span aria-hidden="true" className="mx-2 text-stone-400">
          /
        </span>
        <span aria-current="page">Ändra villkor</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
          Ändra villkor
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          {isDraft
            ? "Ett utkast ersätter hela villkorsbilden: paket, start och slut."
            : "Endast paketet ändras. Tidigare villkor bevaras i villkorshistoriken."}
        </p>
      </header>

      {license.status === "terminated" ? (
        <section className="rounded-lg border border-stone-300 bg-white p-6">
          <h2 className="text-base font-semibold text-stone-950">
            Avslutad licens kan inte ändras
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Skapa en ny licens för tenanten om en ny rättighet behövs.
          </p>
          <Link
            className="mt-5 inline-block rounded-sm text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href={`/licenses/${license.id}`}
          >
            Till licensen
          </Link>
        </section>
      ) : (
        <LicenseForm
          initialValues={{
            currentValidFrom: license.validFrom,
            currentValidUntil: license.validUntil,
            expectedRevision: license.revision,
            licenseId: license.id,
            planKey: license.planKey,
            status: license.status,
            tenantId: license.tenantId,
            tenantLegalName: license.tenantLegalName,
            validFrom: futureStart,
            validUntil: isDraft
              ? toStockholmInputValue(license.validUntil)
              : "",
          }}
          mode="edit"
        />
      )}
    </div>
  );
}
