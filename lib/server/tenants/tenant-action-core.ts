import "server-only";

import type { TenantService } from "./tenant.service-core";
import {
  TenantServiceError,
  type TenantServiceErrorCode,
} from "./tenant.errors";
import type {
  CreateTenantInput,
  Tenant,
  TenantCategory,
  TenantStateMutationInput,
  UpdateTenantInput,
} from "./tenant.types";
import {
  isTenantCategory,
  isUuid,
  validateCreateTenantInput,
  validateStateMutationInput,
  validateUpdateTenantInput,
} from "./tenant.validation";

export const TENANT_ACTION_FIELDS = [
  "category",
  "organizationNumber",
  "legalName",
  "contactName",
  "contactEmail",
  "contactPhone",
  "administrativeNote",
  "expectedRevision",
  "form",
] as const;

export type TenantActionField = (typeof TENANT_ACTION_FIELDS)[number];
export type TenantActionFieldErrors = Readonly<
  Partial<Record<TenantActionField, readonly string[]>>
>;

export type TenantActionResult =
  | Readonly<{
      ok: true;
      revision: number;
      tenantId: string;
    }>
  | Readonly<{
      code: TenantServiceErrorCode;
      fieldErrors?: TenantActionFieldErrors;
      message: string;
      ok: false;
    }>;

type TenantMutationServices = Pick<
  TenantService,
  | "activateTenant"
  | "archiveTenant"
  | "createTenant"
  | "pauseTenant"
  | "restoreTenant"
  | "updateTenant"
>;

export type TenantActionCoreDependencies = Readonly<{
  createCorrelationId(): string;
  rethrowControlFlow(error: unknown): void;
  services: TenantMutationServices;
}>;

const ERROR_MESSAGES: Readonly<Record<TenantServiceErrorCode, string>> =
  Object.freeze({
    audit_failure: "Ändringen kunde inte sparas säkert.",
    conflict: "Uppgifterna har ändrats. Läs in dem igen.",
    invalid_state_transition: "Åtgärden är inte tillåten i aktuellt läge.",
    not_found: "Tenant kunde inte hittas.",
    unauthorized: "Åtkomst nekad.",
    unexpected_error: "Ett oväntat fel inträffade.",
    validation_error: "Kontrollera angivna uppgifter.",
  });

class TenantActionBoundaryError extends Error {
  readonly fieldErrors: TenantActionFieldErrors;

  constructor(field: TenantActionField, message: string) {
    super("validation_error");
    this.name = "TenantActionBoundaryError";
    this.fieldErrors = Object.freeze({
      [field]: Object.freeze([message]),
    });
  }
}

function validationError(field: TenantActionField, message: string): never {
  throw new TenantActionBoundaryError(field, message);
}

function stringValue(
  formData: FormData,
  name: string,
  errorField: TenantActionField = name as TenantActionField,
): string {
  const value = formData.get(name);
  if (typeof value !== "string") {
    return validationError(errorField, "Fältet har ett ogiltigt värde.");
  }
  return value.trim();
}

function requiredString(
  formData: FormData,
  name: string,
  errorField: TenantActionField = name as TenantActionField,
): string {
  const value = stringValue(formData, name, errorField);
  if (value.length === 0) {
    return validationError(errorField, "Fältet är obligatoriskt.");
  }
  return value;
}

function nullableString(
  formData: FormData,
  name: TenantActionField,
  maximumLength: number,
): string | null {
  const value = stringValue(formData, name);
  if (value.length > maximumLength) {
    return validationError(
      name,
      `Fältet får innehålla högst ${maximumLength} tecken.`,
    );
  }
  return value.length === 0 ? null : value;
}

function positiveRevision(formData: FormData): number {
  const value = requiredString(formData, "expectedRevision");
  if (!/^[1-9]\d*$/.test(value)) {
    return validationError(
      "expectedRevision",
      "Revisionen är inte längre giltig. Läs in tenant igen.",
    );
  }
  const revision = Number(value);
  if (!Number.isSafeInteger(revision)) {
    return validationError(
      "expectedRevision",
      "Revisionen är inte längre giltig. Läs in tenant igen.",
    );
  }
  return revision;
}

function organizationNumber(formData: FormData): string | null {
  const value = nullableString(formData, "organizationNumber", 32);
  if (value !== null && !/^[0-9\s-]+$/.test(value)) {
    return validationError(
      "organizationNumber",
      "Ange ett giltigt svenskt organisationsnummer.",
    );
  }
  return value;
}

function contactEmail(formData: FormData): string | null {
  const value = nullableString(formData, "contactEmail", 254);
  if (
    value !== null &&
    (value.length < 3 ||
      /\s/.test(value) ||
      value.indexOf("@") <= 0 ||
      value.lastIndexOf("@") >= value.length - 1)
  ) {
    return validationError("contactEmail", "Ange en giltig e-postadress.");
  }
  return value;
}

function parseCreate(formData: FormData): CreateTenantInput {
  const category = requiredString(formData, "category");
  if (!isTenantCategory(category)) {
    return validationError("category", "Välj en giltig kategori.");
  }

  const legalName = requiredString(formData, "legalName");
  if (legalName.length > 200) {
    return validationError(
      "legalName",
      "Juridiskt namn får innehålla högst 200 tecken.",
    );
  }

  const normalizedOrganizationNumber = organizationNumber(formData);
  if (
    normalizedOrganizationNumber === null &&
    (category === "customer" || category === "pilot")
  ) {
    return validationError(
      "organizationNumber",
      "Organisationsnummer krävs för kund och pilot.",
    );
  }

  const input = {
    administrativeNote: nullableString(formData, "administrativeNote", 1000),
    category: category as TenantCategory,
    contactEmail: contactEmail(formData),
    contactName: nullableString(formData, "contactName", 120),
    contactPhone: nullableString(formData, "contactPhone", 32),
    legalName,
    organizationNumber: normalizedOrganizationNumber,
  };

  return validateCreateTenantInput(input);
}

function parseUpdate(formData: FormData): UpdateTenantInput {
  const tenantId = requiredString(formData, "tenantId", "form");
  if (!isUuid(tenantId)) {
    return validationError("form", "Tenantreferensen är ogiltig.");
  }

  const legalName = requiredString(formData, "legalName");
  if (legalName.length > 200) {
    return validationError(
      "legalName",
      "Juridiskt namn får innehålla högst 200 tecken.",
    );
  }

  const input = {
    administrativeNote: nullableString(formData, "administrativeNote", 1000),
    contactEmail: contactEmail(formData),
    contactName: nullableString(formData, "contactName", 120),
    contactPhone: nullableString(formData, "contactPhone", 32),
    expectedRevision: positiveRevision(formData),
    legalName,
    organizationNumber: organizationNumber(formData),
    tenantId,
  };

  return validateUpdateTenantInput(input);
}

function parseStateMutation(formData: FormData): TenantStateMutationInput {
  const tenantId = requiredString(formData, "tenantId", "form");
  if (!isUuid(tenantId)) {
    return validationError("form", "Tenantreferensen är ogiltig.");
  }

  return validateStateMutationInput({
    expectedRevision: positiveRevision(formData),
    tenantId,
  });
}

function success(tenant: Tenant): TenantActionResult {
  return Object.freeze({
    ok: true,
    revision: tenant.revision,
    tenantId: tenant.id,
  });
}

function failure(
  code: TenantServiceErrorCode,
  fieldErrors?: TenantActionFieldErrors,
): TenantActionResult {
  return Object.freeze({
    code,
    ...(fieldErrors ? { fieldErrors } : {}),
    message: ERROR_MESSAGES[code],
    ok: false,
  });
}

function recordUnexpectedActionError(): void {
  try {
    console.error(
      JSON.stringify({
        code: "unexpected_error",
        event: "tenant_action_failed",
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    // Logging must not affect the masked result.
  }
}

export function createTenantActionCore(
  dependencies: TenantActionCoreDependencies,
) {
  async function execute<Input extends object>(
    formData: FormData,
    parse: (value: FormData) => Input,
    operation: (input: Input & { correlationId: string }) => Promise<Tenant>,
  ): Promise<TenantActionResult> {
    try {
      const input = parse(formData);
      const correlationId = dependencies.createCorrelationId();
      return success(await operation({ ...input, correlationId }));
    } catch (error) {
      dependencies.rethrowControlFlow(error);

      if (error instanceof TenantActionBoundaryError) {
        return failure("validation_error", error.fieldErrors);
      }

      if (error instanceof TenantServiceError) {
        return failure(
          error.code,
          error.code === "validation_error"
            ? Object.freeze({
                form: Object.freeze([ERROR_MESSAGES.validation_error]),
              })
            : undefined,
        );
      }

      recordUnexpectedActionError();
      return failure("unexpected_error");
    }
  }

  return Object.freeze({
    activateTenant(formData: FormData) {
      return execute(
        formData,
        parseStateMutation,
        dependencies.services.activateTenant,
      );
    },
    archiveTenant(formData: FormData) {
      return execute(
        formData,
        parseStateMutation,
        dependencies.services.archiveTenant,
      );
    },
    createTenant(formData: FormData) {
      return execute(formData, parseCreate, dependencies.services.createTenant);
    },
    pauseTenant(formData: FormData) {
      return execute(
        formData,
        parseStateMutation,
        dependencies.services.pauseTenant,
      );
    },
    restoreTenant(formData: FormData) {
      return execute(
        formData,
        parseStateMutation,
        dependencies.services.restoreTenant,
      );
    },
    updateTenant(formData: FormData) {
      return execute(formData, parseUpdate, dependencies.services.updateTenant);
    },
  });
}
