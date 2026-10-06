import "server-only";

import { decodeLicenseListCursor } from "./license-cursor";
import {
  LicenseServiceError,
  mapLicenseDatabaseError,
  recordUnexpectedLicenseError,
} from "./license.errors";
import {
  mapLicenseAuditPage,
  mapLicenseDetail,
  mapLicenseEligibility,
  mapLicenseListPage,
  mapLicenseRow,
  mapLicenseTermsPage,
} from "./license.mapper";
import type {
  LicenseRepository,
  LicenseRepositoryResult,
} from "./license.repository";
import type {
  ChangeLicenseTermsInput,
  CreateLicenseInput,
  License,
  LicenseAuditPage,
  LicenseDetail,
  LicenseLifecycleInput,
  LicenseListPage,
  LicenseProvisioningEligibilityInput,
  LicenseProvisioningEligibilityResult,
  LicenseTermsPage,
  ListLicenseAuditEventsInput,
  ListLicenseTermsVersionsInput,
  ListLicensesInput,
  RenewLicenseInput,
} from "./license.types";
import {
  validateAuditListInput,
  validateChangeTermsInput,
  validateCreateLicenseInput,
  validateEligibilityInput,
  validateLicenseId,
  validateLifecycleInput,
  validateListLicensesInput,
  validateRenewInput,
  validateTermsListInput,
} from "./license.validation";

export type LicenseServiceDependencies = Readonly<{
  getRepository: () => Promise<LicenseRepository>;
  requireOwner: () => Promise<unknown>;
}>;
export type LicenseService = Readonly<{
  activateLicense(input: LicenseLifecycleInput): Promise<License>;
  changeLicenseTerms(input: ChangeLicenseTermsInput): Promise<License>;
  createLicense(input: CreateLicenseInput): Promise<License>;
  getLicense(licenseId: string): Promise<LicenseDetail>;
  getProvisioningEligibility(
    input: LicenseProvisioningEligibilityInput,
  ): Promise<LicenseProvisioningEligibilityResult>;
  listLicenseAuditEvents(
    input: ListLicenseAuditEventsInput,
  ): Promise<LicenseAuditPage>;
  listLicenseTermsVersions(
    input: ListLicenseTermsVersionsInput,
  ): Promise<LicenseTermsPage>;
  listLicenses(input?: ListLicensesInput): Promise<LicenseListPage>;
  renewLicense(input: RenewLicenseInput): Promise<License>;
  suspendLicense(input: LicenseLifecycleInput): Promise<License>;
  terminateLicense(input: LicenseLifecycleInput): Promise<License>;
}>;

// Domain outcomes that eligibility reports as errors rather than results.
const ELIGIBILITY_DOMAIN_ERRORS = new Set([
  "unauthorized",
  "validation_error",
  "not_found",
]);

function unwrap(result: LicenseRepositoryResult<unknown>): unknown {
  if (result.error) throw mapLicenseDatabaseError(result.error);
  return result.data;
}
function requiredLicense(result: LicenseRepositoryResult<unknown>): License {
  const data = unwrap(result);
  if (data === null) {
    recordUnexpectedLicenseError();
    throw new LicenseServiceError("unexpected_error");
  }
  return mapLicenseRow(data);
}

export function createLicenseService(
  dependencies: LicenseServiceDependencies,
): LicenseService {
  // Owner integrity (including MFA/AAL2) always precedes input handling.
  async function guardedRepository(): Promise<LicenseRepository> {
    await dependencies.requireOwner();
    return dependencies.getRepository();
  }
  async function lifecycle(
    input: LicenseLifecycleInput,
    operation: "activateLicense" | "suspendLicense" | "terminateLicense",
  ): Promise<License> {
    const repository = await guardedRepository();
    return requiredLicense(
      await repository[operation](validateLifecycleInput(input)),
    );
  }
  return Object.freeze({
    async listLicenses(input = {}) {
      const repository = await guardedRepository();
      const { cursor, filter, pageSize } = validateListLicensesInput(input);
      const position =
        cursor === null ? null : decodeLicenseListCursor(cursor, filter);
      return mapLicenseListPage(
        unwrap(await repository.listLicenses({ filter, pageSize, position })),
        filter,
        position?.evaluatedAt ?? null,
      );
    },
    async getLicense(licenseId) {
      const repository = await guardedRepository();
      validateLicenseId(licenseId);
      return mapLicenseDetail(
        unwrap(await repository.getLicense(licenseId)),
        licenseId,
      );
    },
    async listLicenseTermsVersions(input) {
      const repository = await guardedRepository();
      const validInput = validateTermsListInput(input);
      return mapLicenseTermsPage(
        unwrap(await repository.listLicenseTermsVersions(validInput)),
        validInput.licenseId,
        validInput.cursorVersion,
      );
    },
    async listLicenseAuditEvents(input) {
      const repository = await guardedRepository();
      const validInput = validateAuditListInput(input);
      return mapLicenseAuditPage(
        unwrap(
          await repository.listLicenseAuditEvents({
            cursor: validInput.cursor ?? null,
            licenseId: validInput.licenseId,
            pageSize: validInput.pageSize,
          }),
        ),
        validInput.licenseId,
      );
    },
    async getProvisioningEligibility(input) {
      const repository = await guardedRepository();
      const validInput = validateEligibilityInput(input);
      try {
        return Object.freeze({
          eligibility: mapLicenseEligibility(
            unwrap(await repository.getProvisioningEligibility(validInput)),
          ),
          kind: "evaluated" as const,
        });
      } catch (error) {
        if (
          error instanceof LicenseServiceError &&
          ELIGIBILITY_DOMAIN_ERRORS.has(error.code)
        )
          throw error;
        // Never eligible and never masked as missing_license.
        return Object.freeze({
          correlationId: recordUnexpectedLicenseError(
            "license_eligibility_read_failed",
          ),
          kind: "technical_read_error" as const,
        });
      }
    },
    async createLicense(input) {
      const repository = await guardedRepository();
      return requiredLicense(
        await repository.createLicense(validateCreateLicenseInput(input)),
      );
    },
    async activateLicense(input) {
      return lifecycle(input, "activateLicense");
    },
    async suspendLicense(input) {
      return lifecycle(input, "suspendLicense");
    },
    async terminateLicense(input) {
      return lifecycle(input, "terminateLicense");
    },
    async changeLicenseTerms(input) {
      const repository = await guardedRepository();
      return requiredLicense(
        await repository.changeLicenseTerms(validateChangeTermsInput(input)),
      );
    },
    async renewLicense(input) {
      const repository = await guardedRepository();
      return requiredLicense(
        await repository.renewLicense(validateRenewInput(input)),
      );
    },
  });
}
