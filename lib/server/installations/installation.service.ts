import "server-only";

import { requireOwnerIntegrity } from "../auth";
import { createSupabaseServerClient } from "../../supabase/server";
import { createInstallationRepository } from "./installation.repository";
import { createInstallationService } from "./installation.service-core";

export {
  createInstallationService,
  type InstallationService,
  type InstallationServiceDependencies,
} from "./installation.service-core";

const installationService = createInstallationService({
  getRepository: async () =>
    createInstallationRepository(await createSupabaseServerClient()),
  requireOwner: requireOwnerIntegrity,
});

export const listInstallations = installationService.listInstallations;
export const getInstallationById = installationService.getInstallationById;
export const listInstallationAuditEvents =
  installationService.listInstallationAuditEvents;
export const createInstallation = installationService.createInstallation;
export const updateInstallation = installationService.updateInstallation;
export const activateInstallation = installationService.activateInstallation;
export const pauseInstallation = installationService.pauseInstallation;
export const decommissionInstallation =
  installationService.decommissionInstallation;
export const archiveInstallation = installationService.archiveInstallation;
export const restoreInstallation = installationService.restoreInstallation;
