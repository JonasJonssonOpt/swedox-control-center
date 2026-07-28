import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";

import {
  getTenantById,
  listTenantAuditEvents,
  TenantServiceError,
} from "@/lib/server/tenants";
import { parseTenantAuditPage } from "@/lib/tenants/tenant-audit-presentation";

import { TenantDetail } from "../tenant-detail";
import { TenantAuditHistory } from "./tenant-audit-history";

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
  let auditPage;
  try {
    tenant = await getTenantById(tenantId);
    auditPage = parseTenantAuditPage(
      await listTenantAuditEvents({ pageSize: 25, tenantId }),
      tenantId,
    );
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TenantServiceError && error.code === "not_found") {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
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
      <div className="mt-5">
        <TenantAuditHistory initialPage={auditPage} tenantId={tenantId} />
      </div>
    </div>
  );
}
