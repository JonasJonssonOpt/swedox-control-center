import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";

import { getTenantById, TenantServiceError } from "@/lib/server/tenants";

import { TenantDetail } from "../tenant-detail";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Tenantdetail | SweDox Control Center",
};

export default async function TenantDetailPage({
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
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 lg:px-8">
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
        <span aria-current="page" className="text-stone-900">
          Detail
        </span>
      </nav>

      <header className="mb-6 flex items-end justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-stone-500">Tenantdetail</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">
            {tenant.legalName}
          </h1>
        </div>
        {tenant.archivedAt === null ? (
          <Link
            className="shrink-0 rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href={`/tenants/${tenant.id}/edit`}
          >
            Redigera
          </Link>
        ) : null}
      </header>

      <TenantDetail tenant={tenant} />
    </main>
  );
}
