import "server-only";

import { requireOwnerIntegrity } from "../auth";
import { createSupabaseServerClient } from "../../supabase/server";
import { createTenantRepository } from "./tenant.repository";
import { createTenantService } from "./tenant.service-core";

export {
  createTenantService,
  type TenantService,
  type TenantServiceDependencies,
} from "./tenant.service-core";

const tenantService = createTenantService({
  getRepository: async () =>
    createTenantRepository(await createSupabaseServerClient()),
  requireOwner: requireOwnerIntegrity,
});

export const listTenants = tenantService.listTenants;
export const getTenantById = tenantService.getTenantById;
export const listTenantAuditEvents = tenantService.listTenantAuditEvents;
export const createTenant = tenantService.createTenant;
export const updateTenant = tenantService.updateTenant;
export const pauseTenant = tenantService.pauseTenant;
export const activateTenant = tenantService.activateTenant;
export const archiveTenant = tenantService.archiveTenant;
export const restoreTenant = tenantService.restoreTenant;
