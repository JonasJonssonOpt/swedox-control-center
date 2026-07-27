import "server-only";

import {
  mapTenantDatabaseError,
  recordUnexpectedTenantError,
  TenantServiceError,
} from "./tenant.errors";
import { mapTenantAuditPage, mapTenantRow } from "./tenant.mapper";
import type {
  TenantRepository,
  TenantRepositoryResult,
} from "./tenant.repository";
import type {
  CreateTenantInput,
  ListTenantAuditEventsInput,
  Tenant,
  TenantAuditPage,
  TenantStateMutationInput,
  UpdateTenantInput,
} from "./tenant.types";
import {
  validateAuditListInput,
  validateCreateTenantInput,
  validateStateMutationInput,
  validateTenantId,
  validateUpdateTenantInput,
} from "./tenant.validation";

export type TenantServiceDependencies = Readonly<{
  getRepository: () => Promise<TenantRepository>;
  requireOwner: () => Promise<unknown>;
}>;

export type TenantService = Readonly<{
  activateTenant(input: TenantStateMutationInput): Promise<Tenant>;
  archiveTenant(input: TenantStateMutationInput): Promise<Tenant>;
  createTenant(input: CreateTenantInput): Promise<Tenant>;
  getTenantById(tenantId: string): Promise<Tenant>;
  listTenantAuditEvents(
    input: ListTenantAuditEventsInput,
  ): Promise<TenantAuditPage>;
  listTenants(): Promise<readonly Tenant[]>;
  pauseTenant(input: TenantStateMutationInput): Promise<Tenant>;
  restoreTenant(input: TenantStateMutationInput): Promise<Tenant>;
  updateTenant(input: UpdateTenantInput): Promise<Tenant>;
}>;

function unwrap(result: TenantRepositoryResult<unknown>): unknown {
  if (result.error) {
    throw mapTenantDatabaseError(result.error);
  }
  return result.data;
}

function mapRequiredTenant(result: TenantRepositoryResult<unknown>): Tenant {
  const data = unwrap(result);
  if (data === null) {
    recordUnexpectedTenantError();
    throw new TenantServiceError("unexpected_error");
  }
  return mapTenantRow(data);
}

export function createTenantService(
  dependencies: TenantServiceDependencies,
): TenantService {
  async function guardedRepository(): Promise<TenantRepository> {
    await dependencies.requireOwner();
    return dependencies.getRepository();
  }

  async function stateMutation(
    input: TenantStateMutationInput,
    operation: keyof Pick<
      TenantRepository,
      "activateTenant" | "archiveTenant" | "pauseTenant" | "restoreTenant"
    >,
  ): Promise<Tenant> {
    const repository = await guardedRepository();
    const validInput = validateStateMutationInput(input);
    return mapRequiredTenant(await repository[operation](validInput));
  }

  return Object.freeze({
    async listTenants() {
      const repository = await guardedRepository();
      const data = unwrap(await repository.listTenants());
      if (!Array.isArray(data)) {
        recordUnexpectedTenantError();
        throw new TenantServiceError("unexpected_error");
      }
      return Object.freeze(data.map(mapTenantRow));
    },
    async getTenantById(tenantId) {
      const repository = await guardedRepository();
      validateTenantId(tenantId);
      const result = await repository.getTenantById(tenantId);
      if (result.error) {
        throw mapTenantDatabaseError(result.error);
      }
      if (result.data === null) {
        throw new TenantServiceError("not_found");
      }
      return mapTenantRow(result.data);
    },
    async listTenantAuditEvents(input) {
      const repository = await guardedRepository();
      const validInput = validateAuditListInput(input);
      const data = unwrap(await repository.listTenantAuditEvents(validInput));
      return mapTenantAuditPage(data, validInput.tenantId);
    },
    async createTenant(input) {
      const repository = await guardedRepository();
      const validInput = validateCreateTenantInput(input);
      return mapRequiredTenant(await repository.createTenant(validInput));
    },
    async updateTenant(input) {
      const repository = await guardedRepository();
      const validInput = validateUpdateTenantInput(input);
      return mapRequiredTenant(await repository.updateTenant(validInput));
    },
    async pauseTenant(input) {
      return stateMutation(input, "pauseTenant");
    },
    async activateTenant(input) {
      return stateMutation(input, "activateTenant");
    },
    async archiveTenant(input) {
      return stateMutation(input, "archiveTenant");
    },
    async restoreTenant(input) {
      return stateMutation(input, "restoreTenant");
    },
  });
}
