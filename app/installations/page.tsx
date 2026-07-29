import type { Metadata } from "next";
import Link from "next/link";

import {
  InstallationServiceError,
  listInstallations,
  type InstallationAdministrativeStatus,
  type InstallationEnvironment,
  type ListInstallationsInput,
} from "@/lib/server/installations";
import { listTenants } from "@/lib/server/tenants";

import {
  InstallationFilters,
  type InstallationFilterValues,
} from "./installation-filters";
import { InstallationList } from "./installation-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Installationer | SweDox Control Center",
};

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;
const ALLOWED_QUERY_PARAMETERS = new Set([
  "search",
  "tenantId",
  "environment",
  "administrativeStatus",
  "includeArchived",
  "cursorDisplayName",
  "cursorId",
]);

function optionalParameter(query: Query, name: string): string | undefined {
  const value = query[name];
  if (value !== undefined && typeof value !== "string") {
    throw new InstallationServiceError("validation_error");
  }
  return value === undefined || value === "" ? undefined : value;
}

function parseListInput(query: Query): {
  hasActiveFilters: boolean;
  input: ListInstallationsInput;
  values: InstallationFilterValues;
} {
  if (Object.keys(query).some((key) => !ALLOWED_QUERY_PARAMETERS.has(key))) {
    throw new InstallationServiceError("validation_error");
  }
  const search = optionalParameter(query, "search");
  const tenantId = optionalParameter(query, "tenantId");
  const environment = optionalParameter(query, "environment");
  const administrativeStatus = optionalParameter(query, "administrativeStatus");
  const includeArchivedValue = optionalParameter(query, "includeArchived");
  if (
    includeArchivedValue !== undefined &&
    includeArchivedValue !== "true" &&
    includeArchivedValue !== "false"
  ) {
    throw new InstallationServiceError("validation_error");
  }
  const cursorDisplayName = optionalParameter(query, "cursorDisplayName");
  const cursorId = optionalParameter(query, "cursorId");
  if ((cursorDisplayName === undefined) !== (cursorId === undefined)) {
    throw new InstallationServiceError("validation_error");
  }
  const includeArchived = includeArchivedValue === "true";
  const input: ListInstallationsInput = {
    administrativeStatus: administrativeStatus as
      InstallationAdministrativeStatus | undefined,
    cursor:
      cursorDisplayName === undefined
        ? undefined
        : { displayName: cursorDisplayName, id: cursorId as string },
    environment: environment as InstallationEnvironment | undefined,
    includeArchived,
    search,
    tenantId,
  };
  return {
    hasActiveFilters:
      search !== undefined ||
      tenantId !== undefined ||
      environment !== undefined ||
      administrativeStatus !== undefined ||
      includeArchived,
    input,
    values: {
      administrativeStatus,
      environment,
      includeArchived,
      search,
      tenantId,
    },
  };
}

export default async function InstallationsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Query> }>) {
  const parsed = parseListInput(await searchParams);
  const [page, tenants] = await Promise.all([
    listInstallations(parsed.input),
    listTenants(),
  ]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
            Installationer
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Administrera och följ registrerade SweDox-installationer.
          </p>
        </div>
        <Link
          className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          href="/installations/new"
        >
          Skapa installation
        </Link>
      </header>

      <InstallationFilters tenants={tenants} values={parsed.values} />
      <InstallationList
        hasActiveFilters={parsed.hasActiveFilters}
        input={parsed.input}
        page={page}
      />
    </div>
  );
}
