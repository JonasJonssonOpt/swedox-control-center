import "server-only";

import { unstable_rethrow } from "next/navigation";

import {
  TenantServiceError,
  type TenantServiceErrorCode,
} from "./tenant.errors";
import type {
  ListTenantAuditEventsInput,
  Tenant,
  TenantAuditCursor,
  TenantAuditPage,
} from "./tenant.types";

const NO_STORE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
});

type TenantRouteContext = Readonly<{
  params: Promise<Readonly<{ tenantId: string }>>;
}>;

export type TenantReadRouteDependencies = Readonly<{
  getTenantById(tenantId: string): Promise<Tenant>;
  listTenantAuditEvents(
    input: ListTenantAuditEventsInput,
  ): Promise<TenantAuditPage>;
  listTenants(): Promise<readonly Tenant[]>;
}>;

function statusFor(code: TenantServiceErrorCode): number {
  switch (code) {
    case "unauthorized":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
    case "invalid_state_transition":
      return 409;
    case "validation_error":
      return 422;
    case "audit_failure":
    case "unexpected_error":
      return 500;
  }
}

function errorResponse(code: TenantServiceErrorCode): Response {
  return Response.json(
    { error: code },
    { headers: NO_STORE_HEADERS, status: statusFor(code) },
  );
}

function recordUnexpectedRouteError(): void {
  try {
    console.error(
      JSON.stringify({
        code: "unexpected_error",
        event: "tenant_read_route_failed",
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    // Logging must not affect the masked response.
  }
}

async function execute<T>(operation: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await operation(), { headers: NO_STORE_HEADERS });
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof TenantServiceError) {
      return errorResponse(error.code);
    }

    recordUnexpectedRouteError();
    return errorResponse("unexpected_error");
  }
}

export function createListTenantsRoute(
  dependencies: Pick<TenantReadRouteDependencies, "listTenants">,
) {
  return async function GET(): Promise<Response> {
    return execute(() => dependencies.listTenants());
  };
}

export function createGetTenantRoute(
  dependencies: Pick<TenantReadRouteDependencies, "getTenantById">,
) {
  return async function GET(
    _request: Request,
    context: TenantRouteContext,
  ): Promise<Response> {
    return execute(async () => {
      const { tenantId } = await context.params;
      return dependencies.getTenantById(tenantId);
    });
  };
}

export function createListTenantAuditEventsRoute(
  dependencies: Pick<TenantReadRouteDependencies, "listTenantAuditEvents">,
) {
  return async function GET(
    request: Request,
    context: TenantRouteContext,
  ): Promise<Response> {
    return execute(async () => {
      const { tenantId } = await context.params;
      const searchParams = new URL(request.url).searchParams;
      const pageSizeValue = searchParams.get("pageSize");
      const cursorId = searchParams.get("cursorId");
      const cursorOccurredAt = searchParams.get("cursorOccurredAt");
      const hasCursorInput = cursorId !== null || cursorOccurredAt !== null;

      return dependencies.listTenantAuditEvents({
        cursor: hasCursorInput
          ? ({
              id: cursorId,
              occurredAt: cursorOccurredAt,
            } as unknown as TenantAuditCursor)
          : undefined,
        pageSize: pageSizeValue === null ? undefined : Number(pageSizeValue),
        tenantId,
      });
    });
  };
}
