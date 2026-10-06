import Link from "next/link";

import { StatusText } from "@/components/ui/status-text";
import {
  formatLicenseDateTime,
  formatLicenseValidUntil,
  licenseStatusLabel,
  licenseValidityLabel,
} from "@/lib/licenses/license-presentation";
import type { LicenseListPage } from "@/lib/server/licenses";

import type { LicenseFilterValues } from "./license-filters";

// Filters travel unchanged with the opaque cursor; the server rejects any mix.
export function licenseListHref(
  values: LicenseFilterValues,
  cursor?: string,
): string {
  const query = new URLSearchParams();
  if (values.search) query.set("search", values.search);
  if (values.tenantId) query.set("tenantId", values.tenantId);
  if (values.status) query.set("status", values.status);
  if (values.validity) query.set("validity", values.validity);
  if (values.includeTerminated) query.set("includeTerminated", "true");
  if (cursor) query.set("cursor", cursor);
  const text = query.toString();
  return text === "" ? "/licenses" : `/licenses?${text}`;
}

export function LicenseList({
  hasActiveFilters,
  page,
  values,
}: Readonly<{
  hasActiveFilters: boolean;
  page: LicenseListPage;
  values: LicenseFilterValues;
}>) {
  if (page.items.length === 0) {
    return (
      <section className="rounded-md border border-stone-300 bg-white px-6 py-10 text-center">
        <h2 className="text-lg font-semibold text-stone-950">
          {hasActiveFilters
            ? "Inga licenser matchar valda filter"
            : "Inga licenser är registrerade"}
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          {hasActiveFilters
            ? "Justera sökningen eller återställ filtren och försök igen."
            : "Licenslistan är tom."}
        </p>
        {hasActiveFilters ? (
          <Link
            className="mt-4 inline-block rounded-sm text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href="/licenses"
          >
            Återställ filter
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-stone-300 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-stone-300 bg-stone-50 text-stone-700">
            <tr>
              {[
                "Tenant",
                "Plan",
                "Administrativ status",
                "Giltighet",
                "Max aktiverade användarkonton",
                "Giltig till",
                "Senast uppdaterad",
              ].map((heading) => (
                <th
                  className="px-4 py-3 font-semibold"
                  key={heading}
                  scope="col"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {page.items.map((license) => (
              <tr key={license.id}>
                <th className="px-4 py-3 font-normal" scope="row">
                  <Link
                    className="rounded-sm font-semibold text-stone-950 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
                    href={`/licenses/${license.id}`}
                  >
                    {license.tenantLegalName}
                  </Link>
                </th>
                <td className="px-4 py-3 text-stone-700">
                  {license.planDisplayLabel}
                </td>
                <td className="px-4 py-3">
                  <StatusText>{licenseStatusLabel(license.status)}</StatusText>
                </td>
                <td className="px-4 py-3">
                  <StatusText>
                    {licenseValidityLabel(license.validity)}
                  </StatusText>
                </td>
                <td className="px-4 py-3 text-stone-700">
                  {license.maxActiveUsers}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-700">
                  {formatLicenseValidUntil(license.validUntil)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-700">
                  {formatLicenseDateTime(license.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {page.evaluatedAt !== null ? (
        <p className="mt-3 text-xs text-stone-500">
          Giltighet bedömd {formatLicenseDateTime(page.evaluatedAt)}. Nästa sida
          bedöms vid samma tidpunkt.
        </p>
      ) : null}

      {page.hasMore && page.nextCursor !== null ? (
        <nav aria-label="Sidnavigering" className="mt-5 flex justify-end">
          <Link
            className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href={licenseListHref(values, page.nextCursor)}
          >
            Nästa sida
          </Link>
        </nav>
      ) : null}
    </>
  );
}
