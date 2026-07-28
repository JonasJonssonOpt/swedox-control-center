import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";

import { getTenantById, TenantServiceError } from "@/lib/server/tenants";

import { TenantForm } from "../../tenant-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Redigera tenant | SweDox Control Center",
};

export default async function EditTenantPage({
  params,
}: Readonly<{ params: Promise<{ tenantId: string }> }>) {
  const { tenantId } = await params;

  let tenant;
  try {
    tenant = await getTenantById(tenantId);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TenantServiceError && error.code === "not_found") {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
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
        <Link
          className="rounded-sm text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          href={`/tenants/${tenant.id}`}
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
          Redigera {tenant.legalName}
        </h1>
      </header>

      {tenant.archivedAt !== null ? (
        <section className="rounded-lg border border-stone-300 bg-white p-6">
          <h2 className="text-base font-semibold text-stone-950">
            Arkiverad tenant kan inte redigeras
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Återställ tenant innan verksamhetsuppgifterna kan ändras.
          </p>
          <Link
            className="mt-5 inline-block rounded-sm text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href={`/tenants/${tenant.id}`}
          >
            Till tenantdetail
          </Link>
        </section>
      ) : (
        <TenantForm
          initialValues={{
            administrativeNote: tenant.administrativeNote ?? "",
            category: tenant.category,
            contactEmail: tenant.contactEmail ?? "",
            contactName: tenant.contactName ?? "",
            contactPhone: tenant.contactPhone ?? "",
            expectedRevision: tenant.revision,
            legalName: tenant.legalName,
            organizationNumber: tenant.organizationNumber ?? "",
            tenantId: tenant.id,
          }}
          mode="edit"
        />
      )}
    </div>
  );
}
