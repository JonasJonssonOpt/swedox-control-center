import "server-only";

import { unstable_rethrow } from "next/navigation";

import {
  InstallationServiceError,
  type InstallationServiceErrorCode,
} from "./installation.errors";
import type {
  InstallationAuditCursor,
  InstallationAuditPage,
  InstallationDetail,
  InstallationListCursor,
  InstallationListPage,
  ListInstallationAuditEventsInput,
  ListInstallationsInput,
} from "./installation.types";

const NO_STORE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
});
const LIST_PARAMETERS = new Set([
  "pageSize",
  "cursorDisplayName",
  "cursorId",
  "tenantId",
  "environment",
  "administrativeStatus",
  "includeArchived",
  "search",
]);
const AUDIT_PARAMETERS = new Set(["pageSize", "cursorOccurredAt", "cursorId"]);
const ERROR_MESSAGES: Readonly<Record<InstallationServiceErrorCode, string>> =
  Object.freeze({
    audit_failure: "Händelsehistoriken kunde inte behandlas.",
    conflict: "Installationen har ändrats. Försök igen.",
    duplicate_installation: "Installationen finns redan.",
    invalid_state_transition: "Åtgärden är inte tillåten i aktuellt läge.",
    not_found: "Installationen hittades inte.",
    tenant_not_available: "Tenant är inte tillgänglig.",
    unauthorized: "Åtkomst nekad.",
    unexpected_error: "Ett oväntat fel inträffade.",
    validation_error: "Begäran innehåller ogiltiga värden.",
  });

type InstallationRouteContext = Readonly<{
  params: Promise<Readonly<{ installationId: string }>>;
}>;
export type InstallationReadRouteDependencies = Readonly<{
  getInstallationById(id: string): Promise<InstallationDetail>;
  listInstallationAuditEvents(
    input: ListInstallationAuditEventsInput,
  ): Promise<InstallationAuditPage>;
  listInstallations(
    input?: ListInstallationsInput,
  ): Promise<InstallationListPage>;
}>;

function statusFor(code: InstallationServiceErrorCode): number {
  switch (code) {
    case "unauthorized":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
    case "invalid_state_transition":
    case "tenant_not_available":
    case "duplicate_installation":
      return 409;
    case "validation_error":
      return 422;
    case "audit_failure":
    case "unexpected_error":
      return 500;
  }
}

function errorResponse(code: InstallationServiceErrorCode): Response {
  return Response.json(
    { error: { code, message: ERROR_MESSAGES[code] } },
    { headers: NO_STORE_HEADERS, status: statusFor(code) },
  );
}

function validationError(): never {
  throw new InstallationServiceError("validation_error");
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
  if (!/^-?\d+$/.test(value)) return validationError();
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

function parseListInput(searchParams: URLSearchParams): ListInstallationsInput {
  assertKnownUniqueParameters(searchParams, LIST_PARAMETERS);
  const cursorDisplayName = optionalValue(searchParams, "cursorDisplayName");
  const cursorId = optionalValue(searchParams, "cursorId");
  if ((cursorDisplayName === undefined) !== (cursorId === undefined)) {
    return validationError();
  }

  return {
    administrativeStatus: optionalValue(
      searchParams,
      "administrativeStatus",
    ) as ListInstallationsInput["administrativeStatus"],
    cursor:
      cursorDisplayName === undefined
        ? undefined
        : ({
            displayName: cursorDisplayName,
            id: cursorId,
          } as InstallationListCursor),
    environment: optionalValue(
      searchParams,
      "environment",
    ) as ListInstallationsInput["environment"],
    includeArchived: optionalBoolean(searchParams, "includeArchived"),
    pageSize: optionalInteger(searchParams, "pageSize"),
    search: optionalValue(searchParams, "search"),
    tenantId: optionalValue(searchParams, "tenantId"),
  };
}

function parseAuditInput(
  searchParams: URLSearchParams,
  installationId: string,
): ListInstallationAuditEventsInput {
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
          } as InstallationAuditCursor),
    installationId,
    pageSize: optionalInteger(searchParams, "pageSize"),
  };
}

function recordUnexpectedRouteError(): void {
  try {
    console.error(
      JSON.stringify({
        code: "unexpected_error",
        event: "installation_read_route_failed",
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    // Logging must not alter the masked response.
  }
}

async function execute<T>(operation: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await operation(), { headers: NO_STORE_HEADERS });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof InstallationServiceError) {
      return errorResponse(error.code);
    }
    recordUnexpectedRouteError();
    return errorResponse("unexpected_error");
  }
}

export function createListInstallationsRoute(
  dependencies: Pick<InstallationReadRouteDependencies, "listInstallations">,
) {
  return async function GET(request: Request): Promise<Response> {
    return execute(() =>
      dependencies.listInstallations(
        parseListInput(new URL(request.url).searchParams),
      ),
    );
  };
}

export function createGetInstallationRoute(
  dependencies: Pick<InstallationReadRouteDependencies, "getInstallationById">,
) {
  return async function GET(
    _request: Request,
    context: InstallationRouteContext,
  ): Promise<Response> {
    return execute(async () => {
      const { installationId } = await context.params;
      return dependencies.getInstallationById(installationId);
    });
  };
}

export function createListInstallationAuditEventsRoute(
  dependencies: Pick<
    InstallationReadRouteDependencies,
    "listInstallationAuditEvents"
  >,
) {
  return async function GET(
    request: Request,
    context: InstallationRouteContext,
  ): Promise<Response> {
    return execute(async () => {
      const { installationId } = await context.params;
      return dependencies.listInstallationAuditEvents(
        parseAuditInput(new URL(request.url).searchParams, installationId),
      );
    });
  };
}
