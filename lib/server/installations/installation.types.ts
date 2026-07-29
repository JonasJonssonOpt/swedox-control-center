import "server-only";

export const INSTALLATION_ENVIRONMENTS = [
  "production",
  "staging",
  "test",
  "development",
] as const;
export const INSTALLATION_ADMINISTRATIVE_STATUSES = [
  "planned",
  "active",
  "paused",
  "decommissioned",
] as const;
export const INSTALLATION_AUDIT_EVENT_TYPES = [
  "installation_created",
  "installation_edited",
  "installation_activated",
  "installation_paused",
  "installation_decommissioned",
  "installation_archived",
  "installation_restored",
] as const;

export type InstallationEnvironment =
  (typeof INSTALLATION_ENVIRONMENTS)[number];
export type InstallationAdministrativeStatus =
  (typeof INSTALLATION_ADMINISTRATIVE_STATUSES)[number];
export type InstallationAuditEventType =
  (typeof INSTALLATION_AUDIT_EVENT_TYPES)[number];

export type Installation = Readonly<{
  administrativeNote: string | null;
  administrativeStatus: InstallationAdministrativeStatus;
  applicationUrl: string | null;
  archivedAt: string | null;
  createdAt: string;
  displayName: string;
  environment: InstallationEnvironment;
  hostingRegion: string | null;
  id: string;
  installationCode: string;
  revision: number;
  supabaseProjectRef: string | null;
  tenantId: string;
  updatedAt: string;
}>;

export type InstallationDetail = Readonly<
  Installation & { tenantLegalName: string }
>;

export type InstallationListItem = Readonly<{
  administrativeStatus: InstallationAdministrativeStatus;
  applicationHost: string | null;
  archivedAt: string | null;
  displayName: string;
  environment: InstallationEnvironment;
  hostingRegion: string | null;
  id: string;
  installationCode: string;
  revision: number;
  tenantId: string;
  tenantLegalName: string;
  updatedAt: string;
}>;

export type InstallationListCursor = Readonly<{
  displayName: string;
  id: string;
}>;

export type ListInstallationsInput = Readonly<{
  administrativeStatus?: InstallationAdministrativeStatus | null;
  cursor?: InstallationListCursor | null;
  environment?: InstallationEnvironment | null;
  includeArchived?: boolean;
  pageSize?: number;
  search?: string | null;
  tenantId?: string | null;
}>;

export type InstallationListPage = Readonly<{
  hasMore: boolean;
  items: readonly InstallationListItem[];
  nextCursor: InstallationListCursor | null;
}>;

export type InstallationAuditCursor = Readonly<{
  id: string;
  occurredAt: string;
}>;

export type ListInstallationAuditEventsInput = Readonly<{
  cursor?: InstallationAuditCursor | null;
  installationId: string;
  pageSize?: number;
}>;

export type InstallationAuditEvent = Readonly<{
  actorUserId: string;
  changedFields: readonly string[];
  correlationId: string | null;
  eventType: InstallationAuditEventType;
  id: string;
  installationId: string;
  occurredAt: string;
  revisionAfter: number;
  revisionBefore: number | null;
}>;

export type InstallationAuditPage = Readonly<{
  hasMore: boolean;
  items: readonly InstallationAuditEvent[];
  nextCursor: InstallationAuditCursor | null;
}>;

export type CreateInstallationInput = Readonly<{
  administrativeNote?: string | null;
  applicationUrl?: string | null;
  correlationId?: string | null;
  displayName: string;
  environment: InstallationEnvironment;
  hostingRegion?: string | null;
  installationCode: string;
  supabaseProjectRef?: string | null;
  tenantId: string;
}>;

export type UpdateInstallationInput = Readonly<{
  administrativeNote: string | null;
  applicationUrl: string | null;
  correlationId?: string | null;
  displayName: string;
  expectedRevision: number;
  hostingRegion: string | null;
  installationId: string;
  supabaseProjectRef: string | null;
}>;

export type InstallationLifecycleInput = Readonly<{
  correlationId?: string | null;
  expectedRevision: number;
  installationId: string;
}>;
