"use client";

import { useRef, useState } from "react";

import {
  formatTenantAuditDateTime,
  formatTenantAuditRevision,
  parseTenantAuditPage,
  TENANT_AUDIT_EVENT_LABELS,
  TENANT_AUDIT_FIELD_LABELS,
  type TenantAuditListItem,
  type TenantAuditPagePayload,
} from "@/lib/tenants/tenant-audit-presentation";

const PAGE_SIZE = 25;

function AuditEvent({ event }: Readonly<{ event: TenantAuditListItem }>) {
  return (
    <li className="border-b border-stone-200 px-5 py-4 last:border-b-0">
      <article>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <h3 className="text-sm font-semibold text-stone-950">
            {TENANT_AUDIT_EVENT_LABELS[event.eventType]}
          </h3>
          <time
            className="shrink-0 text-sm text-stone-600"
            dateTime={event.occurredAt}
          >
            {formatTenantAuditDateTime(event.occurredAt)}
          </time>
        </div>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Aktör
            </dt>
            <dd className="mt-1 text-stone-900">Verifierad owner</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Revision
            </dt>
            <dd className="mt-1 text-stone-900">
              {formatTenantAuditRevision(
                event.revisionBefore,
                event.revisionAfter,
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Ändrade fält
            </dt>
            <dd className="mt-1 text-stone-900">
              {event.changedFields
                .map((field) => TENANT_AUDIT_FIELD_LABELS[field])
                .join(", ")}
            </dd>
          </div>
        </dl>
      </article>
    </li>
  );
}

export function TenantAuditHistory({
  initialPage,
  tenantId,
}: Readonly<{
  initialPage: TenantAuditPagePayload;
  tenantId: string;
}>) {
  const [events, setEvents] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [isPending, setIsPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestPending = useRef(false);

  async function loadMore() {
    if (requestPending.current || !hasMore || nextCursor === null) {
      return;
    }

    requestPending.current = true;
    setIsPending(true);
    setLoadError(null);

    try {
      const searchParams = new URLSearchParams({
        cursorId: nextCursor.id,
        cursorOccurredAt: nextCursor.occurredAt,
        pageSize: String(PAGE_SIZE),
      });
      const response = await fetch(
        `/api/tenants/${encodeURIComponent(tenantId)}/audit?${searchParams}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) {
        throw new Error("audit_request_failed");
      }

      const page = parseTenantAuditPage(
        await response.json(),
        tenantId,
        events,
      );
      setEvents((current) => [...current, ...page.items]);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
    } catch {
      setLoadError("Fler historikhändelser kunde inte hämtas. Försök igen.");
    } finally {
      requestPending.current = false;
      setIsPending(false);
    }
  }

  return (
    <section
      aria-labelledby="tenant-audit-history-heading"
      className="rounded-lg border border-stone-200 bg-white"
    >
      <div className="border-b border-stone-200 px-5 py-3">
        <h2
          className="text-sm font-semibold text-stone-950"
          id="tenant-audit-history-heading"
        >
          Händelsehistorik
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Registrerade ändringar visas som metadata utan tidigare eller nya
          fältvärden.
        </p>
      </div>

      {events.length === 0 ? (
        <p className="p-5 text-sm text-stone-600">
          Det finns inga registrerade händelser för denna tenant.
        </p>
      ) : (
        <ol aria-label="Händelser, nyast först">
          {events.map((event) => (
            <AuditEvent event={event} key={event.id} />
          ))}
        </ol>
      )}

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
            {isPending ? "Fler historikhändelser laddas." : ""}
          </span>
        </div>
      ) : null}
    </section>
  );
}
