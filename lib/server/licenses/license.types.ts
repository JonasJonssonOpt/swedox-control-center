import "server-only";

export const LICENSE_STATUSES = [
  "draft",
  "active",
  "suspended",
  "terminated",
] as const;
export const LICENSE_VALIDITIES = ["not_started", "valid", "expired"] as const;
export const LICENSE_PLAN_KEYS = ["mini", "standard", "stor"] as const;
export const LICENSE_AUDIT_EVENT_TYPES = [
  "license_created",
  "license_terms_changed",
  "license_activated",
  "license_suspended",
  "license_renewed",
  "license_terminated",
] as const;
export const LICENSE_ELIGIBILITY_REASONS = [
  "eligible",
  "missing_license",
  "draft",
  "suspended",
  "terminated",
  "not_started",
  "expired",
  "tenant_unavailable",
  "tenant_installation_mismatch",
] as const;

export type LicenseStatus = (typeof LICENSE_STATUSES)[number];
export type LicenseValidity = (typeof LICENSE_VALIDITIES)[number];
export type LicensePlanKey = (typeof LICENSE_PLAN_KEYS)[number];
export type LicenseAuditEventType = (typeof LICENSE_AUDIT_EVENT_TYPES)[number];
export type LicenseEligibilityReason =
  (typeof LICENSE_ELIGIBILITY_REASONS)[number];

// Approved version 1 catalog; the database derives and enforces the same set.
export const LICENSE_PLAN_CATALOG: Readonly<
  Record<
    LicensePlanKey,
    Readonly<{ displayLabel: string; maxActiveUsers: number; version: 1 }>
  >
> = Object.freeze({
  mini: Object.freeze({ displayLabel: "Mini", maxActiveUsers: 24, version: 1 }),
  standard: Object.freeze({
    displayLabel: "Standard",
    maxActiveUsers: 49,
    version: 1,
  }),
  stor: Object.freeze({
    displayLabel: "Stor",
    maxActiveUsers: 100,
    version: 1,
  }),
});

// Timestamps are DB text with up to microsecond precision; never JS Date.
export type License = Readonly<{
  createdAt: string;
  currentTermsVersion: number;
  id: string;
  revision: number;
  status: LicenseStatus;
  tenantId: string;
  updatedAt: string;
}>;

export type LicenseCurrentTerms = Readonly<{
  maxActiveUsers: number;
  planDisplayLabel: string;
  planKey: LicensePlanKey;
  validFrom: string;
  validUntil: string | null;
}>;

export type LicenseListItem = Readonly<
  LicenseCurrentTerms & {
    createdAt: string;
    currentTermsVersion: number;
    id: string;
    revision: number;
    status: LicenseStatus;
    tenantId: string;
    tenantLegalName: string;
    updatedAt: string;
    validity: LicenseValidity;
  }
>;

export type LicenseDetail = Readonly<
  LicenseListItem & { evaluatedAt: string; planVersion: number }
>;

export type LicenseListFilter = Readonly<{
  includeTerminated: boolean;
  search: string | null;
  status: LicenseStatus | null;
  tenantId: string | null;
  validity: LicenseValidity | null;
}>;

export type ListLicensesInput = Readonly<{
  cursor?: string | null;
  includeTerminated?: boolean;
  pageSize?: number;
  search?: string | null;
  status?: LicenseStatus | null;
  tenantId?: string | null;
  validity?: LicenseValidity | null;
}>;

// Opaque to callers: bound to the series evaluation time and full filter.
export type LicenseListPage = Readonly<{
  evaluatedAt: string | null;
  hasMore: boolean;
  items: readonly LicenseListItem[];
  nextCursor: string | null;
}>;

export type LicenseTermsVersion = Readonly<{
  introducedAt: string;
  introducedAtRevision: number;
  licenseId: string;
  maxActiveUsers: number;
  planDisplayLabel: string;
  planKey: LicensePlanKey;
  planVersion: number;
  validFrom: string;
  validUntil: string | null;
  version: number;
}>;

export type ListLicenseTermsVersionsInput = Readonly<{
  cursorVersion?: number | null;
  licenseId: string;
  pageSize?: number;
}>;

export type LicenseTermsPage = Readonly<{
  hasMore: boolean;
  items: readonly LicenseTermsVersion[];
  nextCursorVersion: number | null;
}>;

export type LicenseAuditCursor = Readonly<{
  id: string;
  occurredAt: string;
}>;

export type ListLicenseAuditEventsInput = Readonly<{
  cursor?: LicenseAuditCursor | null;
  licenseId: string;
  pageSize?: number;
}>;

export type LicenseAuditEvent = Readonly<{
  actorUserId: string;
  changedFields: readonly string[];
  correlationId: string | null;
  eventType: LicenseAuditEventType;
  id: string;
  licenseId: string;
  occurredAt: string;
  revisionAfter: number;
  revisionBefore: number | null;
}>;

export type LicenseAuditPage = Readonly<{
  hasMore: boolean;
  items: readonly LicenseAuditEvent[];
  nextCursor: LicenseAuditCursor | null;
}>;

export type LicenseProvisioningEligibilityInput = Readonly<{
  installationId?: string | null;
  tenantId: string;
}>;

export type LicenseEligibility = Readonly<{
  eligible: boolean;
  evaluatedAt: string;
  licenseId: string | null;
  reason: LicenseEligibilityReason;
  revision: number | null;
  termsVersion: number | null;
  validUntil: string | null;
}>;

// A technical read fault is never a normal reason and carries no eligibility.
export type LicenseProvisioningEligibilityResult =
  | Readonly<{ eligibility: LicenseEligibility; kind: "evaluated" }>
  | Readonly<{ correlationId: string; kind: "technical_read_error" }>;

export type CreateLicenseInput = Readonly<{
  correlationId?: string | null;
  planKey: LicensePlanKey;
  tenantId: string;
  validFrom?: string | null;
  validUntil?: string | null;
}>;

export type LicenseLifecycleInput = Readonly<{
  correlationId?: string | null;
  expectedRevision: number;
  licenseId: string;
}>;

export type ChangeLicenseTermsInput = Readonly<
  LicenseLifecycleInput & {
    planKey: LicensePlanKey;
    validFrom?: string | null;
    validUntil?: string | null;
  }
>;

// validUntil is required: null explicitly means Tills vidare.
export type RenewLicenseInput = Readonly<
  LicenseLifecycleInput & { validUntil: string | null }
>;
