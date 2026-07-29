import "server-only";

import type { InstallationService } from "./installation.service-core";
import {
  InstallationServiceError,
  type InstallationServiceErrorCode,
} from "./installation.errors";
import type {
  CreateInstallationInput,
  Installation,
  InstallationEnvironment,
  InstallationLifecycleInput,
  UpdateInstallationInput,
} from "./installation.types";
import {
  isApplicationUrl,
  isCanonicalName,
  isInstallationEnvironment,
  isUuid,
  validateCreateInstallationInput,
  validateLifecycleInput,
  validateUpdateInstallationInput,
} from "./installation.validation";

export const INSTALLATION_ACTION_FIELDS = [
  "tenantId",
  "installationCode",
  "displayName",
  "environment",
  "applicationUrl",
  "supabaseProjectRef",
  "hostingRegion",
  "administrativeNote",
  "installationId",
  "expectedRevision",
  "form",
] as const;

export type InstallationActionField =
  (typeof INSTALLATION_ACTION_FIELDS)[number];
export type InstallationActionFieldErrors = Readonly<
  Partial<Record<InstallationActionField, readonly string[]>>
>;
export type InstallationActionResult =
  | Readonly<{
      installationId: string;
      ok: true;
      revision: number;
    }>
  | Readonly<{
      code: InstallationServiceErrorCode;
      fieldErrors?: InstallationActionFieldErrors;
      message: string;
      ok: false;
    }>;

type InstallationMutationServices = Pick<
  InstallationService,
  | "activateInstallation"
  | "archiveInstallation"
  | "createInstallation"
  | "decommissionInstallation"
  | "pauseInstallation"
  | "restoreInstallation"
  | "updateInstallation"
>;
export type InstallationActionCoreDependencies = Readonly<{
  createCorrelationId(): string;
  rethrowControlFlow(error: unknown): void;
  services: InstallationMutationServices;
}>;

const ERROR_MESSAGES: Readonly<Record<InstallationServiceErrorCode, string>> =
  Object.freeze({
    audit_failure: "Ändringen kunde inte sparas säkert.",
    conflict: "Installationen har ändrats. Läs in den igen.",
    duplicate_installation:
      "En installation med samma identifierare finns redan.",
    invalid_state_transition: "Åtgärden är inte tillåten i aktuellt läge.",
    not_found: "Installationen kunde inte hittas.",
    tenant_not_available: "Vald tenant är inte tillgänglig för ändringen.",
    unauthorized: "Åtkomst nekad.",
    unexpected_error: "Ett oväntat fel inträffade.",
    validation_error: "Kontrollera angivna uppgifter.",
  });
const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{1,64}$/;
const REGION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class InstallationActionBoundaryError extends Error {
  readonly fieldErrors: InstallationActionFieldErrors;

  constructor(field: InstallationActionField, message: string) {
    super("validation_error");
    this.name = "InstallationActionBoundaryError";
    this.fieldErrors = Object.freeze({
      [field]: Object.freeze([message]),
    });
  }
}

function validationError(
  field: InstallationActionField,
  message: string,
): never {
  throw new InstallationActionBoundaryError(field, message);
}

function stringValue(
  formData: FormData,
  name: string,
  errorField: InstallationActionField = name as InstallationActionField,
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
  errorField: InstallationActionField = name as InstallationActionField,
): string {
  const value = stringValue(formData, name, errorField);
  if (value.length === 0) {
    return validationError(errorField, "Fältet är obligatoriskt.");
  }
  return value;
}

function uuid(formData: FormData, name: "tenantId" | "installationId"): string {
  const value = requiredString(formData, name);
  if (!isUuid(value)) {
    return validationError(name, "Referensen är ogiltig.");
  }
  return value;
}

function positiveRevision(formData: FormData): number {
  const value = requiredString(formData, "expectedRevision");
  if (!/^[1-9]\d*$/.test(value)) {
    return validationError(
      "expectedRevision",
      "Revisionen är ogiltig. Läs in installationen igen.",
    );
  }
  const revision = Number(value);
  if (!Number.isSafeInteger(revision)) {
    return validationError(
      "expectedRevision",
      "Revisionen är ogiltig. Läs in installationen igen.",
    );
  }
  return revision;
}

function displayName(formData: FormData): string {
  const value = requiredString(formData, "displayName");
  if (!isCanonicalName(value)) {
    return validationError(
      "displayName",
      "Namnet måste vara 1–120 tecken utan upprepade blanksteg.",
    );
  }
  return value;
}

function nullableString(
  formData: FormData,
  field:
    | "applicationUrl"
    | "supabaseProjectRef"
    | "hostingRegion"
    | "administrativeNote",
): string | null {
  const value = stringValue(formData, field);
  return value.length === 0 ? null : value;
}

function applicationUrl(formData: FormData): string | null {
  const value = nullableString(formData, "applicationUrl");
  if (value !== null && !isApplicationUrl(value)) {
    return validationError(
      "applicationUrl",
      "Ange en giltig HTTPS-adress utan credentials eller fragment.",
    );
  }
  return value;
}

function projectRef(formData: FormData): string | null {
  const value = nullableString(formData, "supabaseProjectRef");
  if (value !== null && !PROJECT_REF_PATTERN.test(value)) {
    return validationError(
      "supabaseProjectRef",
      "Projektreferensen har ett ogiltigt format.",
    );
  }
  return value;
}

function hostingRegion(formData: FormData): string | null {
  const value = nullableString(formData, "hostingRegion");
  if (value !== null && (value.length > 64 || !REGION_PATTERN.test(value))) {
    return validationError(
      "hostingRegion",
      "Hostingregionen har ett ogiltigt format.",
    );
  }
  return value;
}

function administrativeNote(formData: FormData): string | null {
  const value = nullableString(formData, "administrativeNote");
  if (value !== null && value.length > 1000) {
    return validationError(
      "administrativeNote",
      "Noteringen får innehålla högst 1000 tecken.",
    );
  }
  return value;
}

function parseCreate(formData: FormData): CreateInstallationInput {
  const installationCode = requiredString(formData, "installationCode");
  if (installationCode.length > 64 || !CODE_PATTERN.test(installationCode)) {
    return validationError(
      "installationCode",
      "Installationskoden har ett ogiltigt format.",
    );
  }
  const environment = requiredString(formData, "environment");
  if (!isInstallationEnvironment(environment)) {
    return validationError("environment", "Välj en giltig miljö.");
  }
  return validateCreateInstallationInput({
    administrativeNote: administrativeNote(formData),
    applicationUrl: applicationUrl(formData),
    displayName: displayName(formData),
    environment: environment as InstallationEnvironment,
    hostingRegion: hostingRegion(formData),
    installationCode,
    supabaseProjectRef: projectRef(formData),
    tenantId: uuid(formData, "tenantId"),
  });
}

function parseUpdate(formData: FormData): UpdateInstallationInput {
  return validateUpdateInstallationInput({
    administrativeNote: administrativeNote(formData),
    applicationUrl: applicationUrl(formData),
    displayName: displayName(formData),
    expectedRevision: positiveRevision(formData),
    hostingRegion: hostingRegion(formData),
    installationId: uuid(formData, "installationId"),
    supabaseProjectRef: projectRef(formData),
  });
}

function parseLifecycle(formData: FormData): InstallationLifecycleInput {
  return validateLifecycleInput({
    expectedRevision: positiveRevision(formData),
    installationId: uuid(formData, "installationId"),
  });
}

function success(installation: Installation): InstallationActionResult {
  return Object.freeze({
    installationId: installation.id,
    ok: true,
    revision: installation.revision,
  });
}

function failure(
  code: InstallationServiceErrorCode,
  fieldErrors?: InstallationActionFieldErrors,
): InstallationActionResult {
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
        event: "installation_action_failed",
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    // Logging must not alter the masked result.
  }
}

export function createInstallationActionCore(
  dependencies: InstallationActionCoreDependencies,
) {
  async function execute<Input extends object>(
    formData: FormData,
    parse: (value: FormData) => Input,
    operation: (
      input: Input & { correlationId: string },
    ) => Promise<Installation>,
  ): Promise<InstallationActionResult> {
    try {
      const input = parse(formData);
      const correlationId = dependencies.createCorrelationId();
      return success(await operation({ ...input, correlationId }));
    } catch (error) {
      dependencies.rethrowControlFlow(error);
      if (error instanceof InstallationActionBoundaryError) {
        return failure("validation_error", error.fieldErrors);
      }
      if (error instanceof InstallationServiceError) {
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
    activateInstallation(formData: FormData) {
      return execute(
        formData,
        parseLifecycle,
        dependencies.services.activateInstallation,
      );
    },
    archiveInstallation(formData: FormData) {
      return execute(
        formData,
        parseLifecycle,
        dependencies.services.archiveInstallation,
      );
    },
    createInstallation(formData: FormData) {
      return execute(
        formData,
        parseCreate,
        dependencies.services.createInstallation,
      );
    },
    decommissionInstallation(formData: FormData) {
      return execute(
        formData,
        parseLifecycle,
        dependencies.services.decommissionInstallation,
      );
    },
    pauseInstallation(formData: FormData) {
      return execute(
        formData,
        parseLifecycle,
        dependencies.services.pauseInstallation,
      );
    },
    restoreInstallation(formData: FormData) {
      return execute(
        formData,
        parseLifecycle,
        dependencies.services.restoreInstallation,
      );
    },
    updateInstallation(formData: FormData) {
      return execute(
        formData,
        parseUpdate,
        dependencies.services.updateInstallation,
      );
    },
  });
}
