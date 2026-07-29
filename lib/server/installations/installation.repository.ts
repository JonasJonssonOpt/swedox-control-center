import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../supabase/database.types";
import type {
  CreateInstallationInput,
  InstallationLifecycleInput,
  ListInstallationAuditEventsInput,
  ListInstallationsInput,
  UpdateInstallationInput,
} from "./installation.types";

type FunctionArgs<Name extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][Name] extends { Args: infer Args }
    ? Args
    : never;
export type InstallationRepositoryResult<T> = Readonly<{
  data: T | null;
  error: unknown;
}>;
export type InstallationRepository = Readonly<{
  activateInstallation(
    input: InstallationLifecycleInput,
  ): Promise<InstallationRepositoryResult<unknown>>;
  archiveInstallation(
    input: InstallationLifecycleInput,
  ): Promise<InstallationRepositoryResult<unknown>>;
  createInstallation(
    input: CreateInstallationInput,
  ): Promise<InstallationRepositoryResult<unknown>>;
  decommissionInstallation(
    input: InstallationLifecycleInput,
  ): Promise<InstallationRepositoryResult<unknown>>;
  getInstallationById(
    id: string,
  ): Promise<InstallationRepositoryResult<unknown>>;
  listInstallationAuditEvents(
    input: ListInstallationAuditEventsInput,
  ): Promise<InstallationRepositoryResult<unknown>>;
  listInstallations(
    input: ListInstallationsInput,
  ): Promise<InstallationRepositoryResult<unknown>>;
  pauseInstallation(
    input: InstallationLifecycleInput,
  ): Promise<InstallationRepositoryResult<unknown>>;
  restoreInstallation(
    input: InstallationLifecycleInput,
  ): Promise<InstallationRepositoryResult<unknown>>;
  updateInstallation(
    input: UpdateInstallationInput,
  ): Promise<InstallationRepositoryResult<unknown>>;
}>;

export function createInstallationRepository(
  client: SupabaseClient<Database>,
): InstallationRepository {
  const lifecycle = (
    rpc:
      | "activate_installation"
      | "pause_installation"
      | "decommission_installation"
      | "archive_installation"
      | "restore_installation",
    input: InstallationLifecycleInput,
  ) =>
    client.rpc(rpc, {
      p_correlation_id: input.correlationId ?? undefined,
      p_expected_revision: input.expectedRevision,
      p_installation_id: input.installationId,
    });
  return Object.freeze({
    async listInstallations(input) {
      return client.rpc("list_installations", {
        p_administrative_status: input.administrativeStatus ?? undefined,
        p_cursor_display_name: input.cursor?.displayName,
        p_cursor_id: input.cursor?.id,
        p_environment: input.environment ?? undefined,
        p_include_archived: input.includeArchived,
        p_page_size: input.pageSize,
        p_search: input.search ?? undefined,
        p_tenant_id: input.tenantId ?? undefined,
      });
    },
    async getInstallationById(id) {
      return client
        .from("installations")
        .select(
          "id,tenant_id,installation_code,display_name,environment,administrative_status,application_url,supabase_project_ref,hosting_region,administrative_note,revision,created_at,updated_at,archived_at,tenants!inner(legal_name)",
        )
        .eq("id", id)
        .maybeSingle();
    },
    async listInstallationAuditEvents(input) {
      return client.rpc("list_installation_audit_events", {
        p_cursor_id: input.cursor?.id,
        p_cursor_occurred_at: input.cursor?.occurredAt,
        p_installation_id: input.installationId,
        p_page_size: input.pageSize,
      });
    },
    async createInstallation(input) {
      return client.rpc("create_installation", {
        p_administrative_note: input.administrativeNote ?? "",
        p_application_url: input.applicationUrl ?? "",
        p_correlation_id: input.correlationId ?? undefined,
        p_display_name: input.displayName,
        p_environment: input.environment,
        p_hosting_region: input.hostingRegion ?? "",
        p_installation_code: input.installationCode,
        p_supabase_project_ref: input.supabaseProjectRef ?? "",
        p_tenant_id: input.tenantId,
      } as FunctionArgs<"create_installation">);
    },
    async updateInstallation(input) {
      return client.rpc("update_installation", {
        p_administrative_note: input.administrativeNote ?? "",
        p_application_url: input.applicationUrl ?? "",
        p_correlation_id: input.correlationId ?? undefined,
        p_display_name: input.displayName,
        p_expected_revision: input.expectedRevision,
        p_hosting_region: input.hostingRegion ?? "",
        p_installation_id: input.installationId,
        p_supabase_project_ref: input.supabaseProjectRef ?? "",
      } as FunctionArgs<"update_installation">);
    },
    async activateInstallation(input) {
      return lifecycle("activate_installation", input);
    },
    async pauseInstallation(input) {
      return lifecycle("pause_installation", input);
    },
    async decommissionInstallation(input) {
      return lifecycle("decommission_installation", input);
    },
    async archiveInstallation(input) {
      return lifecycle("archive_installation", input);
    },
    async restoreInstallation(input) {
      return lifecycle("restore_installation", input);
    },
  });
}
