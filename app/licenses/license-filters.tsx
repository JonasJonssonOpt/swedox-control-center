import Link from "next/link";

import {
  LICENSE_STATUS_LABELS,
  LICENSE_VALIDITY_LABELS,
} from "@/lib/licenses/license-presentation";

export type LicenseFilterValues = Readonly<{
  includeTerminated: boolean;
  search?: string;
  status?: string;
  tenantId?: string;
  validity?: string;
}>;
export type LicenseTenantOption = Readonly<{ id: string; legalName: string }>;

export function LicenseFilters({
  tenants,
  values,
}: Readonly<{
  tenants: readonly LicenseTenantOption[];
  values: LicenseFilterValues;
}>) {
  const controlClass =
    "mt-1 block h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900";

  return (
    <form
      action="/licenses"
      className="mb-5 rounded-md border border-stone-300 bg-white p-4"
      method="get"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(15rem,1.5fr)_minmax(12rem,1fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)]">
        <div>
          <label
            className="block text-sm font-medium text-stone-800"
            htmlFor="license-search"
          >
            Sök tenant
          </label>
          <input
            className={controlClass}
            defaultValue={values.search}
            id="license-search"
            maxLength={200}
            name="search"
            placeholder="Tenantens juridiska namn"
            type="search"
          />
          <p className="mt-1 text-xs text-stone-500">
            Söker endast i tenantens juridiska namn.
          </p>
        </div>

        <div>
          <label
            className="block text-sm font-medium text-stone-800"
            htmlFor="license-tenant"
          >
            Tenant
          </label>
          <select
            className={controlClass}
            defaultValue={values.tenantId}
            id="license-tenant"
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
            htmlFor="license-status"
          >
            Administrativ status
          </label>
          <select
            className={controlClass}
            defaultValue={values.status}
            id="license-status"
            name="status"
          >
            <option value="">Alla statusar</option>
            {Object.entries(LICENSE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="block text-sm font-medium text-stone-800"
            htmlFor="license-validity"
          >
            Giltighet
          </label>
          <select
            className={controlClass}
            defaultValue={values.validity}
            id="license-validity"
            name="validity"
          >
            <option value="">All giltighet</option>
            {Object.entries(LICENSE_VALIDITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <label className="flex items-center gap-2 text-sm text-stone-800">
            <input
              className="size-4 rounded border-stone-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
              defaultChecked={values.includeTerminated}
              name="includeTerminated"
              type="checkbox"
              value="true"
            />
            Visa avslutade
          </label>
          <p className="mt-1 text-xs text-stone-500">
            Krävs för att filtrera på status Avslutad.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            className="rounded-sm text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href="/licenses"
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
