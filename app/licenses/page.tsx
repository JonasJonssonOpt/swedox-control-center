import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";

import {
  LicenseServiceError,
  listLicenses,
  type LicenseListPage,
  type ListLicensesInput,
} from "@/lib/server/licenses";
import { listTenants } from "@/lib/server/tenants";

import { LicenseFilters, type LicenseFilterValues } from "./license-filters";
import { LicenseList, licenseListHref } from "./license-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Licenser | SweDox Control Center",
};

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;
const ALLOWED_QUERY_PARAMETERS = new Set([
  "search",
  "tenantId",
  "status",
  "validity",
  "includeTerminated",
  "cursor",
]);

type ParsedQuery =
  | Readonly<{ ok: false }>
  | Readonly<{
      cursor?: string;
      hasActiveFilters: boolean;
      input: ListLicensesInput;
      ok: true;
      values: LicenseFilterValues;
    }>;

function single(query: Query, name: string): string | undefined | null {
  const value = query[name];
  if (value !== undefined && typeof value !== "string") return null;
  return value === undefined || value === "" ? undefined : value;
}

// Unknown, repeated or malformed parameters never reach the service.
function parseQuery(query: Query): ParsedQuery {
  if (Object.keys(query).some((key) => !ALLOWED_QUERY_PARAMETERS.has(key))) {
    return { ok: false };
  }
  const values = [...ALLOWED_QUERY_PARAMETERS].map((name) =>
    single(query, name),
  );
  if (values.some((value) => value === null)) return { ok: false };
  const [search, tenantId, status, validity, includeTerminated, cursor] =
    values as (string | undefined)[];
  if (
    includeTerminated !== undefined &&
    includeTerminated !== "true" &&
    includeTerminated !== "false"
  ) {
    return { ok: false };
  }
  const filterValues: LicenseFilterValues = {
    includeTerminated: includeTerminated === "true",
    search,
    status,
    tenantId,
    validity,
  };
  return {
    cursor,
    hasActiveFilters:
      search !== undefined ||
      tenantId !== undefined ||
      status !== undefined ||
      validity !== undefined ||
      filterValues.includeTerminated,
    input: {
      cursor,
      includeTerminated: filterValues.includeTerminated,
      search,
      status: status as ListLicensesInput["status"],
      tenantId,
      validity: validity as ListLicensesInput["validity"],
    },
    ok: true,
    values: filterValues,
  };
}

function InvalidQueryNotice({
  restartHref,
  stale,
}: Readonly<{ restartHref: string; stale: boolean }>) {
  return (
    <section
      className="rounded-md border border-stone-400 bg-stone-50 px-6 py-6"
      role="alert"
    >
      <h2 className="text-base font-semibold text-stone-950">
        {stale
          ? "Listan behöver läsas in från början"
          : "Filtren kunde inte användas"}
      </h2>
      <p className="mt-2 text-sm text-stone-700">
        {stale
          ? "Sidlänken gäller inte längre för valda filter, eller så har den ändrats. Inga licenser har ändrats av detta."
          : "Länken innehåller ogiltiga eller motstridiga filter, till exempel status Avslutad utan Visa avslutade."}
      </p>
      <Link
        className="mt-4 inline-block rounded-sm text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        href={restartHref}
      >
        {stale ? "Läs in första sidan" : "Återställ filter"}
      </Link>
    </section>
  );
}

export default async function LicensesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Query> }>) {
  const parsed = parseQuery(await searchParams);
  const tenants = await listTenants();
  let page: LicenseListPage | null = null;
  if (parsed.ok) {
    try {
      page = await listLicenses(parsed.input);
    } catch (error) {
      unstable_rethrow(error);
      if (
        !(error instanceof LicenseServiceError) ||
        error.code !== "validation_error"
      ) {
        throw error;
      }
    }
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
            Licenser
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Administrera tenantlicenser, villkor och giltighet. Kapaciteten är
            beviljat maxantal aktiverade användarkonton för hela tenanten.
          </p>
        </div>
        <Link
          className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          href="/licenses/new"
        >
          Skapa licens
        </Link>
      </header>

      <LicenseFilters
        tenants={tenants.map((tenant) => ({
          id: tenant.id,
          legalName: tenant.legalName,
        }))}
        values={parsed.ok ? parsed.values : { includeTerminated: false }}
      />
      {parsed.ok && page !== null ? (
        <LicenseList
          hasActiveFilters={parsed.hasActiveFilters}
          page={page}
          values={parsed.values}
        />
      ) : (
        <InvalidQueryNotice
          restartHref={
            parsed.ok && parsed.cursor !== undefined
              ? licenseListHref(parsed.values)
              : "/licenses"
          }
          stale={parsed.ok && parsed.cursor !== undefined}
        />
      )}
    </div>
  );
}
