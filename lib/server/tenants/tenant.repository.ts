import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../supabase/database.types";
import type {
  CreateTenantInput,
  ListTenantAuditEventsInput,
  TenantStateMutationInput,
  UpdateTenantInput,
} from "./tenant.types";

type FunctionArgs<Name extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][Name] extends { Args: infer Args }
    ? Args
    : never;

export type TenantRepositoryResult<T> = Readonly<{
  data: T | null;
  error: unknown;
}>;

export type TenantRepository = Readonly<{
  activateTenant(
    input: TenantStateMutationInput,
  ): Promise<TenantRepositoryResult<unknown>>;
  archiveTenant(
    input: TenantStateMutationInput,
  ): Promise<TenantRepositoryResult<unknown>>;
  createTenant(
    input: CreateTenantInput,
  ): Promise<TenantRepositoryResult<unknown>>;
  getTenantById(tenantId: string): Promise<TenantRepositoryResult<unknown>>;
  listTenantAuditEvents(
    input: ListTenantAuditEventsInput,
  ): Promise<TenantRepositoryResult<unknown>>;
  listTenants(): Promise<TenantRepositoryResult<unknown>>;
  pauseTenant(
    input: TenantStateMutationInput,
  ): Promise<TenantRepositoryResult<unknown>>;
  restoreTenant(
    input: TenantStateMutationInput,
  ): Promise<TenantRepositoryResult<unknown>>;
  updateTenant(
    input: UpdateTenantInput,
  ): Promise<TenantRepositoryResult<unknown>>;
}>;

export function createTenantRepository(
  client: SupabaseClient<Database>,
): TenantRepository {
  return {
    async listTenants() {
      return client
        .from("tenants")
        .select("*")
        .is("archived_at", null)
        .order("legal_name", { ascending: true })
        .order("id", { ascending: true });
    },
    async getTenantById(tenantId) {
      return client
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .maybeSingle();
    },
    async listTenantAuditEvents(input) {
      return client.rpc("list_tenant_audit_events", {
        p_cursor_id: input.cursor?.id,
        p_cursor_occurred_at: input.cursor?.occurredAt,
        p_page_size: input.pageSize,
        p_tenant_id: input.tenantId,
      });
    },
    async createTenant(input) {
      const args = {
        p_administrative_note: input.administrativeNote,
        p_category: input.category,
        p_contact_email: input.contactEmail,
        p_contact_name: input.contactName,
        p_contact_phone: input.contactPhone,
        p_correlation_id: input.correlationId,
        p_legal_name: input.legalName,
        p_organization_number: input.organizationNumber,
      } as unknown as FunctionArgs<"create_tenant">;

      return client.rpc("create_tenant", args);
    },
    async updateTenant(input) {
      const args = {
        p_administrative_note: input.administrativeNote,
        p_contact_email: input.contactEmail,
        p_contact_name: input.contactName,
        p_contact_phone: input.contactPhone,
        p_correlation_id: input.correlationId,
        p_expected_revision: input.expectedRevision,
        p_legal_name: input.legalName,
        p_organization_number: input.organizationNumber,
        p_tenant_id: input.tenantId,
      } as unknown as FunctionArgs<"update_tenant">;

      return client.rpc("update_tenant", args);
    },
    async pauseTenant(input) {
      return client.rpc("pause_tenant", stateMutationArguments(input));
    },
    async activateTenant(input) {
      return client.rpc("activate_tenant", stateMutationArguments(input));
    },
    async archiveTenant(input) {
      return client.rpc("archive_tenant", stateMutationArguments(input));
    },
    async restoreTenant(input) {
      return client.rpc("restore_tenant", stateMutationArguments(input));
    },
  };
}

function stateMutationArguments(
  input: TenantStateMutationInput,
): FunctionArgs<"pause_tenant"> {
  return {
    p_correlation_id: input.correlationId,
    p_expected_revision: input.expectedRevision,
    p_tenant_id: input.tenantId,
  } as unknown as FunctionArgs<"pause_tenant">;
}
