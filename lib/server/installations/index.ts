import "server-only";

export {
  activateInstallation,
  archiveInstallation,
  createInstallation,
  createInstallationService,
  decommissionInstallation,
  getInstallationById,
  listInstallationAuditEvents,
  listInstallations,
  pauseInstallation,
  restoreInstallation,
  updateInstallation,
  type InstallationService,
  type InstallationServiceDependencies,
} from "./installation.service";
export {
  InstallationServiceError,
  type InstallationServiceErrorCode,
} from "./installation.errors";
export type {
  CreateInstallationInput,
  Installation,
  InstallationAdministrativeStatus,
  InstallationAuditCursor,
  InstallationAuditEvent,
  InstallationAuditEventType,
  InstallationAuditPage,
  InstallationDetail,
  InstallationEnvironment,
  InstallationLifecycleInput,
  InstallationListCursor,
  InstallationListItem,
  InstallationListPage,
  ListInstallationAuditEventsInput,
  ListInstallationsInput,
  UpdateInstallationInput,
} from "./installation.types";
