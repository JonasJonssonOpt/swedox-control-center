import "server-only";

import {
  LicenseServiceError,
  recordUnexpectedLicenseError,
  type LicenseServiceErrorCode,
} from "./license.errors";
import type { LicenseService } from "./license.service-core";
import { stockholmLocalToUtc } from "./license-time";
import type {
  ChangeLicenseTermsInput,
  CreateLicenseInput,
  License,
  LicenseLifecycleInput,
  LicensePlanKey,
  RenewLicenseInput,
} from "./license.types";
import {
  compareTimestamps,
  isLicensePlanKey,
  isUuid,
  validateChangeTermsInput,
  validateCreateLicenseInput,
  validateLifecycleInput,
  validateRenewInput,
} from "./license.validation";

// Allowlisted FormData fields; anything else (including any capacity, label,
// terms version, actor or correlation field) is never read.
export const LICENSE_ACTION_FIELDS = [
  "tenantId",
  "licenseId",
  "expectedRevision",
  "planKey",
  "validFrom",
  "validUntil",
  "openEnded",
  "form",
] as const;

export type LicenseActionField = (typeof LICENSE_ACTION_FIELDS)[number];
export type LicenseActionFieldErrors = Readonly<
  Partial<Record<LicenseActionField, readonly string[]>>
>;
export type LicenseActionResult =
  | Readonly<{ licenseId: string; ok: true; revision: number }>
  | Readonly<{
      code: LicenseServiceErrorCode;
      fieldErrors?: LicenseActionFieldErrors;
      message: string;
      ok: false;
    }>;

type LicenseMutationServices = Pick<
  LicenseService,
  | "activateLicense"
  | "changeLicenseTerms"
  | "createLicense"
  | "renewLicense"
  | "suspendLicense"
  | "terminateLicense"
>;
export type LicenseActionCoreDependencies = Readonly<{
  createCorrelationId(): string;
  rethrowControlFlow(error: unknown): void;
  services: LicenseMutationServices;
}>;

const ERROR_MESSAGES: Readonly<Record<LicenseServiceErrorCode, string>> =
  Object.freeze({
    audit_failure: "Ändringen kunde inte sparas säkert.",
    conflict: "Licensen har ändrats. Läs in den igen.",
    duplicate_license: "Tenanten har redan en licens som inte är avslutad.",
    invalid_state_transition:
      "Åtgärden är inte tillåten i licensens aktuella läge.",
    not_found: "Licensen eller tenanten kunde inte hittas.",
    tenant_not_available: "Tenanten är inte tillgänglig för ändringen.",
    unauthorized: "Åtkomst nekad.",
    unexpected_error: "Ett oväntat fel inträffade.",
    validation_error: "Kontrollera angivna uppgifter.",
  });

class LicenseActionBoundaryError extends Error {
  readonly fieldErrors: LicenseActionFieldErrors;

  constructor(field: LicenseActionField, message: string) {
    super("validation_error");
    this.name = "LicenseActionBoundaryError";
    this.fieldErrors = Object.freeze({ [field]: Object.freeze([message]) });
  }
}

function validationError(field: LicenseActionField, message: string): never {
  throw new LicenseActionBoundaryError(field, message);
}

function stringValue(formData: FormData, field: LicenseActionField): string {
  const value = formData.get(field);
  if (value === null) return "";
  if (typeof value !== "string" || formData.getAll(field).length !== 1) {
    return validationError(field, "Fältet har ett ogiltigt värde.");
  }
  return value.trim();
}

function uuid(formData: FormData, field: "tenantId" | "licenseId"): string {
  const value = stringValue(formData, field);
  if (!isUuid(value)) return validationError(field, "Referensen är ogiltig.");
  return value;
}

function expectedRevision(formData: FormData): number {
  const value = stringValue(formData, "expectedRevision");
  const revision = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(revision)) {
    return validationError(
      "expectedRevision",
      "Revisionen är ogiltig. Läs in licensen igen.",
    );
  }
  return revision;
}

function planKey(formData: FormData): LicensePlanKey {
  const value = stringValue(formData, "planKey");
  if (!isLicensePlanKey(value)) {
    return validationError("planKey", "Välj ett giltigt paket.");
  }
  return value;
}

function optionalDateTime(
  formData: FormData,
  field: "validFrom" | "validUntil",
): string | null {
  const value = stringValue(formData, field);
  if (value === "") return null;
  const instant = stockholmLocalToUtc(value);
  if (instant === null) {
    return validationError(
      field,
      "Ange en giltig tidpunkt i svensk tid. Tider som saknas eller är tvetydiga vid sommartidsbyte kan inte användas.",
    );
  }
  return instant;
}

function interval(validFrom: string | null, validUntil: string | null): void {
  if (
    validFrom !== null &&
    validUntil !== null &&
    compareTimestamps(validUntil, validFrom) <= 0
  ) {
    validationError("validUntil", "Sluttiden måste vara efter starttiden.");
  }
}

function lifecycleFields(formData: FormData): LicenseLifecycleInput {
  return {
    expectedRevision: expectedRevision(formData),
    licenseId: uuid(formData, "licenseId"),
  };
}

function parseCreate(formData: FormData): CreateLicenseInput {
  const validFrom = optionalDateTime(formData, "validFrom");
  const validUntil = optionalDateTime(formData, "validUntil");
  interval(validFrom, validUntil);
  return validateCreateLicenseInput({
    planKey: planKey(formData),
    tenantId: uuid(formData, "tenantId"),
    validFrom,
    validUntil,
  });
}

function parseLifecycle(formData: FormData): LicenseLifecycleInput {
  return validateLifecycleInput(lifecycleFields(formData));
}

function parseChangeTerms(formData: FormData): ChangeLicenseTermsInput {
  const validFrom = optionalDateTime(formData, "validFrom");
  const validUntil = optionalDateTime(formData, "validUntil");
  interval(validFrom, validUntil);
  return validateChangeTermsInput({
    ...lifecycleFields(formData),
    planKey: planKey(formData),
    validFrom,
    validUntil,
  });
}

// Renewal requires an explicit choice: a new end or Tills vidare, not both.
function parseRenew(formData: FormData): RenewLicenseInput {
  const openEndedValue = stringValue(formData, "openEnded");
  if (openEndedValue !== "" && openEndedValue !== "true") {
    return validationError("openEnded", "Fältet har ett ogiltigt värde.");
  }
  const validUntil = optionalDateTime(formData, "validUntil");
  const openEnded = openEndedValue === "true";
  if (openEnded === (validUntil !== null)) {
    return validationError(
      "validUntil",
      "Ange en ny sluttid eller välj Tills vidare.",
    );
  }
  return validateRenewInput({ ...lifecycleFields(formData), validUntil });
}

function success(license: License): LicenseActionResult {
  return Object.freeze({
    licenseId: license.id,
    ok: true,
    revision: license.revision,
  });
}

function failure(
  code: LicenseServiceErrorCode,
  fieldErrors?: LicenseActionFieldErrors,
): LicenseActionResult {
  return Object.freeze({
    code,
    ...(fieldErrors ? { fieldErrors } : {}),
    message: ERROR_MESSAGES[code],
    ok: false,
  });
}

export function createLicenseActionCore(
  dependencies: LicenseActionCoreDependencies,
) {
  async function execute<Input extends object>(
    formData: FormData,
    parse: (value: FormData) => Input,
    operation: (input: Input & { correlationId: string }) => Promise<License>,
  ): Promise<LicenseActionResult> {
    try {
      const input = parse(formData);
      // Correlation is server-generated, never taken from the client.
      const correlationId = dependencies.createCorrelationId();
      return success(await operation({ ...input, correlationId }));
    } catch (error) {
      dependencies.rethrowControlFlow(error);
      if (error instanceof LicenseActionBoundaryError) {
        return failure("validation_error", error.fieldErrors);
      }
      if (error instanceof LicenseServiceError) {
        return failure(
          error.code,
          error.code === "validation_error"
            ? Object.freeze({
                form: Object.freeze([ERROR_MESSAGES.validation_error]),
              })
            : undefined,
        );
      }
      recordUnexpectedLicenseError("license_action_failed");
      return failure("unexpected_error");
    }
  }

  const { services } = dependencies;
  return Object.freeze({
    activateLicense: (formData: FormData) =>
      execute(formData, parseLifecycle, services.activateLicense),
    changeLicenseTerms: (formData: FormData) =>
      execute(formData, parseChangeTerms, services.changeLicenseTerms),
    createLicense: (formData: FormData) =>
      execute(formData, parseCreate, services.createLicense),
    renewLicense: (formData: FormData) =>
      execute(formData, parseRenew, services.renewLicense),
    suspendLicense: (formData: FormData) =>
      execute(formData, parseLifecycle, services.suspendLicense),
    terminateLicense: (formData: FormData) =>
      execute(formData, parseLifecycle, services.terminateLicense),
  });
}
