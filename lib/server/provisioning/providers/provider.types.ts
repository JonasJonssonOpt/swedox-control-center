import "server-only";

// Catalog v1, identical to the database constraint ck_provisioning_run_steps_catalog.
export const PROVISIONING_STEP_KEYS = [
  "supabase_project",
  "database_schema",
  "application_deployment",
  "initial_administrator",
  "installation_verification",
] as const;

export type ProvisioningStepKey = (typeof PROVISIONING_STEP_KEYS)[number];

export const PROVISIONING_RESULT_FIELDS = [
  "supabaseProjectRef",
  "hostingRegion",
  "applicationUrl",
] as const;

export type ProvisioningResultField =
  (typeof PROVISIONING_RESULT_FIELDS)[number];

// Exactly the result arguments of complete_provisioning_step. A field the
// step does not own is always null.
export type ProvisioningStepResults = Readonly<{
  applicationUrl: string | null;
  hostingRegion: string | null;
  supabaseProjectRef: string | null;
}>;

export type ProvisioningRunbook = Readonly<{
  /** Steps the operator performs outside Control Center, in order. */
  instructions: readonly string[];
  resultFields: readonly ProvisioningResultField[];
  summary: string;
  title: string;
}>;

// 1.0 has only operator-performed steps. A future automated provider is a
// separate change-step with its own security analysis (F2E1/F2E6).
export type ManualProvisioningStepProvider = Readonly<{
  kind: "manual";
  normalizeResults(input: unknown): ProvisioningStepResults;
  position: number;
  runbook: ProvisioningRunbook;
  stepKey: ProvisioningStepKey;
}>;

export type ProvisioningStepProvider = ManualProvisioningStepProvider;

export class ProvisioningProviderError extends Error {
  readonly code = "validation_error";
  readonly field: ProvisioningResultField | "form";

  constructor(field: ProvisioningResultField | "form", message: string) {
    super(message);
    this.name = "ProvisioningProviderError";
    this.field = field;
  }
}
