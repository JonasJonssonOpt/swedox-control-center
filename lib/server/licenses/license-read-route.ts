import "server-only";

import { unstable_rethrow } from "next/navigation";

import {
  LicenseServiceError,
  recordUnexpectedLicenseError,
  type LicenseServiceErrorCode,
} from "./license.errors";
import type {
  LicenseAuditCursor,
  LicenseAuditPage,
  LicenseDetail,
  LicenseListPage,
  LicenseTermsPage,
  ListLicenseAuditEventsInput,
  ListLicenseTermsVersionsInput,
  ListLicensesInput,
} from "./license.types";

const NO_STORE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
});
const LIST_PARAMETERS = new Set([
  "pageSize",
  "cursor",
  "tenantId",
  "status",
  "validity",
  "includeTerminated",
  "search",
]);
const TERMS_PARAMETERS = new Set(["pageSize", "cursorVersion"]);
const AUDIT_PARAMETERS = new Set(["pageSize", "cursorOccurredAt", "cursorId"]);
const ERROR_MESSAGES: Readonly<Record<LicenseServiceErrorCode, string>> =
  Object.freeze({
    audit_failure: "Händelsehistoriken kunde inte behandlas.",
    conflict: "Licensen har ändrats. Försök igen.",
    duplicate_license: "Tenanten har redan en licens som inte är avslutad.",
    invalid_state_transition: "Åtgärden är inte tillåten i aktuellt läge.",
    not_found: "Licensen hittades inte.",
    tenant_not_available: "Tenant är inte tillgänglig.",
    unauthorized: "Åtkomst nekad.",
    unexpected_error: "Ett oväntat fel inträffade.",
    validation_error:
      "Begäran innehåller ogiltiga värden. Läs in listan från början.",
  });

type LicenseRouteContext = Readonly<{
  params: Promise<Readonly<{ licenseId: string }>>;
}>;
export type LicenseReadRouteDependencies = Readonly<{
  getLicense(licenseId: string): Promise<LicenseDetail>;
  listLicenseAuditEvents(
    input: ListLicenseAuditEventsInput,
  ): Promise<LicenseAuditPage>;
  listLicenseTermsVersions(
    input: ListLicenseTermsVersionsInput,
  ): Promise<LicenseTermsPage>;
  listLicenses(input?: ListLicensesInput): Promise<LicenseListPage>;
}>;

function statusFor(code: LicenseServiceErrorCode): number {
  switch (code) {
    case "unauthorized":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
    case "invalid_state_transition":
    case "tenant_not_available":
    case "duplicate_license":
      return 409;
    case "validation_error":
      return 422;
    case "audit_failure":
    case "unexpected_error":
      return 500;
  }
}

function errorResponse(code: LicenseServiceErrorCode): Response {
  return Response.json(
    { error: { code, message: ERROR_MESSAGES[code] } },
    { headers: NO_STORE_HEADERS, status: statusFor(code) },
  );
}

function validationError(): never {
  throw new LicenseServiceError("validation_error");
}

function assertKnownUniqueParameters(
  searchParams: URLSearchParams,
  allowed: ReadonlySet<string>,
): void {
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) {
      validationError();
    }
  }
}

function optionalValue(
  searchParams: URLSearchParams,
  key: string,
): string | undefined {
  const value = searchParams.get(key);
  return value === null || value === "" ? undefined : value;
}

function optionalInteger(
  searchParams: URLSearchParams,
  key: string,
): number | undefined {
  const value = optionalValue(searchParams, key);
  if (value === undefined) return undefined;
  if (!/^[1-9]\d{0,15}$/.test(value)) return validationError();
  return Number(value);
}

function optionalBoolean(
  searchParams: URLSearchParams,
  key: string,
): boolean | undefined {
  const value = optionalValue(searchParams, key);
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return validationError();
}

function parseListInput(searchParams: URLSearchParams): ListLicensesInput {
  assertKnownUniqueParameters(searchParams, LIST_PARAMETERS);
  // Enum values are validated by the service; casts only carry the text.
  return {
    cursor: optionalValue(searchParams, "cursor"),
    includeTerminated: optionalBoolean(searchParams, "includeTerminated"),
    pageSize: optionalInteger(searchParams, "pageSize"),
    search: optionalValue(searchParams, "search"),
    status: optionalValue(
      searchParams,
      "status",
    ) as ListLicensesInput["status"],
    tenantId: optionalValue(searchParams, "tenantId"),
    validity: optionalValue(
      searchParams,
      "validity",
    ) as ListLicensesInput["validity"],
  };
}

function parseTermsInput(
  searchParams: URLSearchParams,
  licenseId: string,
): ListLicenseTermsVersionsInput {
  assertKnownUniqueParameters(searchParams, TERMS_PARAMETERS);
  return {
    cursorVersion: optionalInteger(searchParams, "cursorVersion"),
    licenseId,
    pageSize: optionalInteger(searchParams, "pageSize"),
  };
}

function parseAuditInput(
  searchParams: URLSearchParams,
  licenseId: string,
): ListLicenseAuditEventsInput {
  assertKnownUniqueParameters(searchParams, AUDIT_PARAMETERS);
  const cursorOccurredAt = optionalValue(searchParams, "cursorOccurredAt");
  const cursorId = optionalValue(searchParams, "cursorId");
  if ((cursorOccurredAt === undefined) !== (cursorId === undefined)) {
    return validationError();
  }
  return {
    cursor:
      cursorOccurredAt === undefined
        ? undefined
        : ({
            id: cursorId,
            occurredAt: cursorOccurredAt,
          } as LicenseAuditCursor),
    licenseId,
    pageSize: optionalInteger(searchParams, "pageSize"),
  };
}

async function execute<T>(operation: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await operation(), { headers: NO_STORE_HEADERS });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof LicenseServiceError) {
      return errorResponse(error.code);
    }
    recordUnexpectedLicenseError("license_read_route_failed");
    return errorResponse("unexpected_error");
  }
}

export function createListLicensesRoute(
  dependencies: Pick<LicenseReadRouteDependencies, "listLicenses">,
) {
  return async function GET(request: Request): Promise<Response> {
    return execute(() =>
      dependencies.listLicenses(
        parseListInput(new URL(request.url).searchParams),
      ),
    );
  };
}

export function createGetLicenseRoute(
  dependencies: Pick<LicenseReadRouteDependencies, "getLicense">,
) {
  return async function GET(
    _request: Request,
    context: LicenseRouteContext,
  ): Promise<Response> {
    return execute(async () => {
      const { licenseId } = await context.params;
      return dependencies.getLicense(licenseId);
    });
  };
}

export function createListLicenseTermsVersionsRoute(
  dependencies: Pick<LicenseReadRouteDependencies, "listLicenseTermsVersions">,
) {
  return async function GET(
    request: Request,
    context: LicenseRouteContext,
  ): Promise<Response> {
    return execute(async () => {
      const { licenseId } = await context.params;
      return dependencies.listLicenseTermsVersions(
        parseTermsInput(new URL(request.url).searchParams, licenseId),
      );
    });
  };
}

export function createListLicenseAuditEventsRoute(
  dependencies: Pick<LicenseReadRouteDependencies, "listLicenseAuditEvents">,
) {
  return async function GET(
    request: Request,
    context: LicenseRouteContext,
  ): Promise<Response> {
    return execute(async () => {
      const { licenseId } = await context.params;
      return dependencies.listLicenseAuditEvents(
        parseAuditInput(new URL(request.url).searchParams, licenseId),
      );
    });
  };
}
