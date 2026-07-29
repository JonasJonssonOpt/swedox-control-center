import "server-only";

import {
  mapInstallationDatabaseError,
  recordUnexpectedInstallationError,
  InstallationServiceError,
} from "./installation.errors";
import {
  mapInstallationAuditPage,
  mapInstallationDetailRow,
  mapInstallationListPage,
  mapInstallationRow,
} from "./installation.mapper";
import type {
  InstallationRepository,
  InstallationRepositoryResult,
} from "./installation.repository";
import type {
  CreateInstallationInput,
  Installation,
  InstallationAuditPage,
  InstallationDetail,
  InstallationLifecycleInput,
  InstallationListPage,
  ListInstallationAuditEventsInput,
  ListInstallationsInput,
  UpdateInstallationInput,
} from "./installation.types";
import {
  validateAuditListInput,
  validateCreateInstallationInput,
  validateInstallationId,
  validateLifecycleInput,
  validateListInstallationsInput,
  validateUpdateInstallationInput,
} from "./installation.validation";

export type InstallationServiceDependencies = Readonly<{
  getRepository: () => Promise<InstallationRepository>;
  requireOwner: () => Promise<unknown>;
}>;
export type InstallationService = Readonly<{
  activateInstallation(
    input: InstallationLifecycleInput,
  ): Promise<Installation>;
  archiveInstallation(input: InstallationLifecycleInput): Promise<Installation>;
  createInstallation(input: CreateInstallationInput): Promise<Installation>;
  decommissionInstallation(
    input: InstallationLifecycleInput,
  ): Promise<Installation>;
  getInstallationById(id: string): Promise<InstallationDetail>;
  listInstallationAuditEvents(
    input: ListInstallationAuditEventsInput,
  ): Promise<InstallationAuditPage>;
  listInstallations(
    input?: ListInstallationsInput,
  ): Promise<InstallationListPage>;
  pauseInstallation(input: InstallationLifecycleInput): Promise<Installation>;
  restoreInstallation(input: InstallationLifecycleInput): Promise<Installation>;
  updateInstallation(input: UpdateInstallationInput): Promise<Installation>;
}>;

function unwrap(result: InstallationRepositoryResult<unknown>): unknown {
  if (result.error) throw mapInstallationDatabaseError(result.error);
  return result.data;
}
function requiredInstallation(
  result: InstallationRepositoryResult<unknown>,
): Installation {
  const data = unwrap(result);
  if (data === null) {
    recordUnexpectedInstallationError();
    throw new InstallationServiceError("unexpected_error");
  }
  return mapInstallationRow(data);
}

export function createInstallationService(
  dependencies: InstallationServiceDependencies,
): InstallationService {
  async function guardedRepository(): Promise<InstallationRepository> {
    await dependencies.requireOwner();
    return dependencies.getRepository();
  }
  async function lifecycle(
    input: InstallationLifecycleInput,
    operation: keyof Pick<
      InstallationRepository,
      | "activateInstallation"
      | "archiveInstallation"
      | "decommissionInstallation"
      | "pauseInstallation"
      | "restoreInstallation"
    >,
  ): Promise<Installation> {
    const repository = await guardedRepository();
    const validInput = validateLifecycleInput(input);
    return requiredInstallation(await repository[operation](validInput));
  }
  return Object.freeze({
    async listInstallations(input = {}) {
      const repository = await guardedRepository();
      const validInput = validateListInstallationsInput(input);
      return mapInstallationListPage(
        unwrap(await repository.listInstallations(validInput)),
      );
    },
    async getInstallationById(id) {
      const repository = await guardedRepository();
      validateInstallationId(id);
      const result = await repository.getInstallationById(id);
      if (result.error) throw mapInstallationDatabaseError(result.error);
      if (result.data === null) throw new InstallationServiceError("not_found");
      return mapInstallationDetailRow(result.data);
    },
    async listInstallationAuditEvents(input) {
      const repository = await guardedRepository();
      const validInput = validateAuditListInput(input);
      return mapInstallationAuditPage(
        unwrap(await repository.listInstallationAuditEvents(validInput)),
        validInput.installationId,
      );
    },
    async createInstallation(input) {
      const repository = await guardedRepository();
      return requiredInstallation(
        await repository.createInstallation(
          validateCreateInstallationInput(input),
        ),
      );
    },
    async updateInstallation(input) {
      const repository = await guardedRepository();
      return requiredInstallation(
        await repository.updateInstallation(
          validateUpdateInstallationInput(input),
        ),
      );
    },
    async activateInstallation(input) {
      return lifecycle(input, "activateInstallation");
    },
    async pauseInstallation(input) {
      return lifecycle(input, "pauseInstallation");
    },
    async decommissionInstallation(input) {
      return lifecycle(input, "decommissionInstallation");
    },
    async archiveInstallation(input) {
      return lifecycle(input, "archiveInstallation");
    },
    async restoreInstallation(input) {
      return lifecycle(input, "restoreInstallation");
    },
  });
}
