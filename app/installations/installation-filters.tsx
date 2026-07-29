import Link from "next/link";

import type { Tenant } from "@/lib/server/tenants";

export type InstallationFilterValues = Readonly<{
  administrativeStatus?: string;
  environment?: string;
  includeArchived: boolean;
  search?: string;
  tenantId?: string;
}>;

export function InstallationFilters({
  tenants,
  values,
}: Readonly<{
  tenants: readonly Tenant[];
  values: InstallationFilterValues;
}>) {
  const controlClass =
    "mt-1 block h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900";

  return (
    <form
      action="/installations"
      className="mb-5 rounded-md border border-stone-300 bg-white p-4"
      method="get"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(15rem,1.5fr)_minmax(12rem,1fr)_minmax(10rem,0.8fr)_minmax(11rem,0.9fr)]">
        <div>
          <label
            className="block text-sm font-medium text-stone-800"
            htmlFor="installation-search"
          >
            Sök installation
          </label>
          <input
            className={controlClass}
            defaultValue={values.search}
            id="installation-search"
            name="search"
            placeholder="Namn eller installationskod"
            type="search"
          />
          <p className="mt-1 text-xs text-stone-500">
            Söker endast i installationsnamn och installationskod.
          </p>
        </div>

        <div>
          <label
            className="block text-sm font-medium text-stone-800"
            htmlFor="installation-tenant"
          >
            Tenant
          </label>
          <select
            className={controlClass}
            defaultValue={values.tenantId}
            id="installation-tenant"
            name="tenantId"
          >
            <option value="">Alla tenants</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.legalName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="block text-sm font-medium text-stone-800"
            htmlFor="installation-environment"
          >
            Environment
          </label>
          <select
            className={controlClass}
            defaultValue={values.environment}
            id="installation-environment"
            name="environment"
          >
            <option value="">Alla miljöer</option>
            <option value="production">Produktion</option>
            <option value="staging">Staging</option>
            <option value="test">Test</option>
            <option value="development">Utveckling</option>
          </select>
        </div>

        <div>
          <label
            className="block text-sm font-medium text-stone-800"
            htmlFor="installation-status"
          >
            Administrativ status
          </label>
          <select
            className={controlClass}
            defaultValue={values.administrativeStatus}
            id="installation-status"
            name="administrativeStatus"
          >
            <option value="">Alla statusar</option>
            <option value="planned">Planerad</option>
            <option value="active">Aktiv</option>
            <option value="paused">Pausad</option>
            <option value="decommissioned">Avvecklad</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-sm text-stone-800">
          <input
            className="size-4 rounded border-stone-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            defaultChecked={values.includeArchived}
            name="includeArchived"
            type="checkbox"
            value="true"
          />
          Visa arkiverade
        </label>
        <div className="flex items-center gap-4">
          <Link
            className="rounded-sm text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href="/installations"
          >
            Återställ filter
          </Link>
          <button
            className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            type="submit"
          >
            Sök och filtrera
          </button>
        </div>
      </div>
    </form>
  );
}
