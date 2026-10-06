"use client";

import { useRef, useState } from "react";

import {
  formatLicenseDateTime,
  formatLicenseValidUntil,
  parseLicenseTermsPage,
  type LicenseTermsPagePayload,
} from "@/lib/licenses/license-presentation";

const PAGE_SIZE = 25;

export function LicenseTermsHistory({
  currentVersion,
  initialPage,
  licenseId,
}: Readonly<{
  currentVersion: number;
  initialPage: LicenseTermsPagePayload;
  licenseId: string;
}>) {
  const [versions, setVersions] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursorVersion);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [isPending, setIsPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestPending = useRef(false);

  async function loadMore() {
    if (requestPending.current || !hasMore || nextCursor === null) return;
    requestPending.current = true;
    setIsPending(true);
    setLoadError(null);
    try {
      const searchParams = new URLSearchParams({
        cursorVersion: String(nextCursor),
        pageSize: String(PAGE_SIZE),
      });
      const response = await fetch(
        `/api/licenses/${encodeURIComponent(licenseId)}/terms?${searchParams}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) throw new Error("terms_request_failed");
      const page = parseLicenseTermsPage(
        await response.json(),
        licenseId,
        versions,
      );
      setVersions((current) => [...current, ...page.items]);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursorVersion);
    } catch {
      setLoadError(
        "Fler villkorsversioner kunde inte hämtas. Ladda om sidan om licensen kan ha ändrats.",
      );
    } finally {
      requestPending.current = false;
      setIsPending(false);
    }
  }

  return (
    <section
      aria-labelledby="license-terms-history-heading"
      className="rounded-md border border-stone-300 bg-white"
    >
      <div className="border-b border-stone-200 px-5 py-3">
        <h2
          className="text-base font-semibold text-stone-950"
          id="license-terms-history-heading"
        >
          Villkorshistorik
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Varje villkorsversion bevaras oförändrad, nyast först. Avbrott mellan
          perioder syns som skillnad mellan sluttid och nästa starttid.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-700">
            <tr>
              {[
                "Version",
                "Paket",
                "Max aktiverade användarkonton",
                "Giltig från",
                "Giltig till",
                "Infördes",
              ].map((heading) => (
                <th
                  className="px-5 py-3 font-semibold"
                  key={heading}
                  scope="col"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {versions.map((version) => (
              <tr key={version.version}>
                <th className="px-5 py-3 font-normal" scope="row">
                  {version.version}
                  {version.version === currentVersion ? (
                    <span className="ml-2 text-xs text-stone-600">
                      (aktuell)
                    </span>
                  ) : null}
                </th>
                <td className="px-5 py-3 text-stone-700">
                  {version.planDisplayLabel}
                </td>
                <td className="px-5 py-3 text-stone-700">
                  {version.maxActiveUsers}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-stone-700">
                  {formatLicenseDateTime(version.validFrom)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-stone-700">
                  {formatLicenseValidUntil(version.validUntil)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-stone-700">
                  {formatLicenseDateTime(version.introducedAt)} (revision{" "}
                  {version.introducedAtRevision})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loadError === null ? null : (
        <p className="mx-5 mt-4 text-sm text-red-800" role="alert">
          {loadError}
        </p>
      )}

      {hasMore ? (
        <div className="border-t border-stone-200 p-5">
          <button
            aria-disabled={isPending}
            className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:cursor-not-allowed disabled:text-stone-400"
            disabled={isPending}
            onClick={loadMore}
            type="button"
          >
            {isPending ? "Laddar…" : "Ladda fler"}
          </button>
          <span aria-live="polite" className="sr-only">
            {isPending ? "Fler villkorsversioner laddas." : ""}
          </span>
        </div>
      ) : null}
    </section>
  );
}
