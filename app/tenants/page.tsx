import type { Metadata } from "next";
import Link from "next/link";

import { listTenants } from "@/lib/server/tenants";

import { TenantList } from "./tenant-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Tenants | SweDox Control Center",
};

export default async function TenantsPage() {
  const tenants = await listTenants();

  return (
    <div>
      <header className="mb-6 flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
            Tenants
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Icke-arkiverade kund-, pilot- och interna tenants.
          </p>
        </div>
        <Link
          className="shrink-0 rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          href="/tenants/new"
        >
          Skapa tenant
        </Link>
      </header>

      <TenantList tenants={tenants} />
    </div>
  );
}
