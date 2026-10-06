import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../supabase/database.types";
import type { LicenseListCursorPosition } from "./license-cursor";
import type {
  ChangeLicenseTermsInput,
  CreateLicenseInput,
  LicenseLifecycleInput,
  LicenseListFilter,
  RenewLicenseInput,
} from "./license.types";

type FunctionArgs<Name extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][Name] extends { Args: infer Args }
    ? Args
    : never;
export type LicenseRepositoryResult<T> = Readonly<{
  data: T | null;
  error: unknown;
}>;
type Result = Promise<LicenseRepositoryResult<unknown>>;

export type LicenseRepositoryListInput = Readonly<{
  filter: LicenseListFilter;
  pageSize: number;
  position: LicenseListCursorPosition | null;
}>;

// Only the intended Licensing RPCs; no table reads or writes.
export type LicenseRepository = Readonly<{
  activateLicense(input: LicenseLifecycleInput): Result;
  changeLicenseTerms(input: ChangeLicenseTermsInput): Result;
  createLicense(input: CreateLicenseInput): Result;
  getLicense(licenseId: string): Result;
  getProvisioningEligibility(
    input: Readonly<{ installationId: string | null; tenantId: string }>,
  ): Result;
  listLicenseAuditEvents(
    input: Readonly<{
      cursor: Readonly<{ id: string; occurredAt: string }> | null;
      licenseId: string;
      pageSize: number;
    }>,
  ): Result;
  listLicenseTermsVersions(
    input: Readonly<{
      cursorVersion: number | null;
      licenseId: string;
      pageSize: number;
    }>,
  ): Result;
  listLicenses(input: LicenseRepositoryListInput): Result;
  renewLicense(input: RenewLicenseInput): Result;
  suspendLicense(input: LicenseLifecycleInput): Result;
  terminateLicense(input: LicenseLifecycleInput): Result;
}>;

export function createLicenseRepository(
  client: SupabaseClient<Database>,
): LicenseRepository {
  // Omitted (undefined) optional arguments use the SQL default NULL.
  const lifecycle = (
    rpc: "activate_license" | "suspend_license" | "terminate_license",
    input: LicenseLifecycleInput,
  ) =>
    client.rpc(rpc, {
      p_correlation_id: input.correlationId ?? undefined,
      p_expected_revision: input.expectedRevision,
      p_license_id: input.licenseId,
    });
  return Object.freeze({
    async listLicenses({ filter, pageSize, position }) {
      return client.rpc("list_licenses", {
        p_cursor_created_at: position?.createdAt,
        p_cursor_id: position?.id,
        p_evaluated_at: position?.evaluatedAt,
        p_include_terminated: filter.includeTerminated,
        p_page_size: pageSize,
        p_search: filter.search ?? undefined,
        p_status: filter.status ?? undefined,
        p_tenant_id: filter.tenantId ?? undefined,
        p_validity: filter.validity ?? undefined,
      });
    },
    async getLicense(licenseId) {
      return client.rpc("get_license", { p_license_id: licenseId });
    },
    async listLicenseTermsVersions(input) {
      return client.rpc("list_license_terms_versions", {
        p_cursor_version: input.cursorVersion ?? undefined,
        p_license_id: input.licenseId,
        p_page_size: input.pageSize,
      });
    },
    async listLicenseAuditEvents(input) {
      return client.rpc("list_license_audit_events", {
        p_cursor_id: input.cursor?.id,
        p_cursor_occurred_at: input.cursor?.occurredAt,
        p_license_id: input.licenseId,
        p_page_size: input.pageSize,
      });
    },
    async getProvisioningEligibility(input) {
      return client.rpc("get_license_provisioning_eligibility", {
        p_installation_id: input.installationId ?? undefined,
        p_tenant_id: input.tenantId,
      });
    },
    async createLicense(input) {
      return client.rpc("create_license", {
        p_correlation_id: input.correlationId ?? undefined,
        p_plan_key: input.planKey,
        p_tenant_id: input.tenantId,
        p_valid_from: input.validFrom ?? undefined,
        p_valid_until: input.validUntil ?? undefined,
      });
    },
    async activateLicense(input) {
      return lifecycle("activate_license", input);
    },
    async suspendLicense(input) {
      return lifecycle("suspend_license", input);
    },
    async terminateLicense(input) {
      return lifecycle("terminate_license", input);
    },
    async changeLicenseTerms(input) {
      return client.rpc("change_license_terms", {
        p_correlation_id: input.correlationId ?? undefined,
        p_expected_revision: input.expectedRevision,
        p_license_id: input.licenseId,
        p_plan_key: input.planKey,
        p_valid_from: input.validFrom ?? undefined,
        p_valid_until: input.validUntil ?? undefined,
      });
    },
    async renewLicense(input) {
      // Generated Args type NULL as string; NULL is Tills vidare and explicit.
      return client.rpc("renew_license", {
        p_correlation_id: input.correlationId ?? undefined,
        p_expected_revision: input.expectedRevision,
        p_license_id: input.licenseId,
        p_valid_until: input.validUntil,
      } as FunctionArgs<"renew_license">);
    },
  });
}
