import Link from "next/link";

import { StatusText } from "@/components/ui/status-text";
import {
  formatOrganizationNumber,
  formatTenantDateTime,
  tenantCategoryLabel,
  tenantStatusLabel,
  valueOrMissing,
} from "@/lib/server/tenants/tenant-presentation";
import type { Tenant } from "@/lib/server/tenants";

export function TenantList({
  tenants,
}: Readonly<{ tenants: readonly Tenant[] }>) {
  if (tenants.length === 0) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white px-6 py-10 text-center">
        <h2 className="text-base font-semibold text-stone-900">
          Inga tenants att visa
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Det finns inga aktiva eller pausade, icke-arkiverade tenants.
        </p>
      </section>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
          <tr>
            <th className="px-4 py-3" scope="col">
              Juridiskt namn
            </th>
            <th className="px-4 py-3" scope="col">
              Organisationsnummer
            </th>
            <th className="px-4 py-3" scope="col">
              Kategori
            </th>
            <th className="px-4 py-3" scope="col">
              Status
            </th>
            <th className="px-4 py-3" scope="col">
              Kontaktperson
            </th>
            <th className="px-4 py-3" scope="col">
              Uppdaterad
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">
          {tenants.map((tenant) => (
            <tr className="text-stone-700" key={tenant.id}>
              <th className="px-4 py-3 font-medium" scope="row">
                <Link
                  className="rounded-sm text-stone-950 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
                  href={`/tenants/${tenant.id}`}
                >
                  {tenant.legalName}
                </Link>
              </th>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                {formatOrganizationNumber(tenant.organizationNumber)}
              </td>
              <td className="px-4 py-3">
                {tenantCategoryLabel(tenant.category)}
              </td>
              <td className="px-4 py-3">
                <StatusText>
                  {tenantStatusLabel(tenant.operationalStatus)}
                </StatusText>
              </td>
              <td className="px-4 py-3">
                {valueOrMissing(tenant.contactName)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <time dateTime={tenant.updatedAt}>
                  {formatTenantDateTime(tenant.updatedAt)}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
