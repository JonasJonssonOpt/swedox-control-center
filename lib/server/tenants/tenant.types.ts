import "server-only";

export const TENANT_CATEGORIES = ["customer", "pilot", "internal"] as const;
export const TENANT_STATUSES = ["active", "paused"] as const;
export const TENANT_AUDIT_EVENT_TYPES = [
  "tenant_created",
  "tenant_edited",
  "tenant_paused",
  "tenant_activated",
  "tenant_archived",
  "tenant_restored",
] as const;

export type TenantCategory = (typeof TENANT_CATEGORIES)[number];
export type TenantOperationalStatus = (typeof TENANT_STATUSES)[number];
export type TenantAuditEventType = (typeof TENANT_AUDIT_EVENT_TYPES)[number];

export type Tenant = Readonly<{
  administrativeNote: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  category: TenantCategory;
  contactEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  countryCode: "SE";
  createdAt: string;
  createdBy: string;
  id: string;
  legalName: string;
  operationalStatus: TenantOperationalStatus;
  organizationNumber: string | null;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}>;

export type CreateTenantInput = Readonly<{
  administrativeNote?: string | null;
  category: TenantCategory;
  contactEmail?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  correlationId?: string | null;
  legalName: string;
  organizationNumber: string | null;
}>;

export type UpdateTenantInput = Readonly<{
  administrativeNote: string | null;
  contactEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  correlationId?: string | null;
  expectedRevision: number;
  legalName: string;
  organizationNumber: string | null;
  tenantId: string;
}>;

export type TenantStateMutationInput = Readonly<{
  correlationId?: string | null;
  expectedRevision: number;
  tenantId: string;
}>;

export type TenantAuditCursor = Readonly<{
  id: string;
  occurredAt: string;
}>;

export type ListTenantAuditEventsInput = Readonly<{
  cursor?: TenantAuditCursor | null;
  pageSize?: number;
  tenantId: string;
}>;

export type TenantAuditEvent = Readonly<{
  actorUserId: string;
  changedFields: readonly string[];
  correlationId: string | null;
  eventType: TenantAuditEventType;
  id: string;
  occurredAt: string;
  revisionAfter: number;
  revisionBefore: number | null;
  tenantId: string;
}>;

export type TenantAuditPage = Readonly<{
  hasMore: boolean;
  items: readonly TenantAuditEvent[];
  nextCursor: TenantAuditCursor | null;
}>;
