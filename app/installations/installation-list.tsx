import Link from "next/link";

import { StatusText } from "@/components/ui/status-text";
import {
  formatInstallationDateTime,
  installationEnvironmentLabel,
  installationStatusLabel,
  installationValueOrMissing,
} from "@/lib/server/installations/installation-presentation";
import type {
  InstallationListPage,
  ListInstallationsInput,
} from "@/lib/server/installations";

function nextPageHref(
  input: ListInstallationsInput,
  cursor: NonNullable<InstallationListPage["nextCursor"]>,
): string {
  const query = new URLSearchParams();
  if (input.search) query.set("search", input.search);
  if (input.tenantId) query.set("tenantId", input.tenantId);
  if (input.environment) query.set("environment", input.environment);
  if (input.administrativeStatus)
    query.set("administrativeStatus", input.administrativeStatus);
  if (input.includeArchived) query.set("includeArchived", "true");
  query.set("cursorDisplayName", cursor.displayName);
  query.set("cursorId", cursor.id);
  return `/installations?${query.toString()}`;
}

export function InstallationList({
  hasActiveFilters,
  input,
  page,
}: Readonly<{
  hasActiveFilters: boolean;
  input: ListInstallationsInput;
  page: InstallationListPage;
}>) {
  if (page.items.length === 0) {
    return (
      <section className="rounded-md border border-stone-300 bg-white px-6 py-10 text-center">
        <h2 className="text-lg font-semibold text-stone-950">
          {hasActiveFilters
            ? "Inga installationer matchar valda filter"
            : "Inga installationer är registrerade"}
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          {hasActiveFilters
            ? "Justera sökningen eller återställ filtren och försök igen."
            : "Installationslistan är tom."}
        </p>
        {hasActiveFilters ? (
          <Link
            className="mt-4 inline-block rounded-sm text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href="/installations"
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
                "Installation",
                "Tenant",
                "Environment",
                "Administrativ status",
                "Region",
                "Application host",
                "Uppdaterad",
              ].map((heading) => (
                <th
                  className="whitespace-nowrap px-4 py-3 font-semibold"
                  key={heading}
                  scope="col"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {page.items.map((installation) => (
              <tr key={installation.id}>
                <th className="px-4 py-3 font-normal" scope="row">
                  <Link
                    className="rounded-sm font-semibold text-stone-950 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
                    href={`/installations/${installation.id}`}
                  >
                    {installation.displayName}
                  </Link>
                  <span className="mt-1 block text-xs text-stone-500">
                    {installation.installationCode}
                  </span>
                  {installation.archivedAt !== null ? (
                    <span className="mt-1 block text-xs font-medium text-stone-700">
                      Arkiverad
                    </span>
                  ) : null}
                </th>
                <td className="px-4 py-3 text-stone-700">
                  {installation.tenantLegalName}
                </td>
                <td className="px-4 py-3 text-stone-700">
                  {installationEnvironmentLabel(installation.environment)}
                </td>
                <td className="px-4 py-3">
                  <StatusText>
                    {installationStatusLabel(installation.administrativeStatus)}
                  </StatusText>
                </td>
                <td className="px-4 py-3 text-stone-700">
                  {installationValueOrMissing(installation.hostingRegion)}
                </td>
                <td className="px-4 py-3 text-stone-700">
                  {installationValueOrMissing(installation.applicationHost)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-700">
                  {formatInstallationDateTime(installation.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {page.hasMore && page.nextCursor !== null ? (
        <nav aria-label="Sidnavigering" className="mt-5 flex justify-end">
          <Link
            className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            href={nextPageHref(input, page.nextCursor)}
          >
            Nästa sida
          </Link>
        </nav>
      ) : null}
    </>
  );
}
