import "server-only";

import { requireOwnerIntegrity } from "../auth";
import { createSupabaseServerClient } from "../../supabase/server";
import { createLicenseRepository } from "./license.repository";
import { createLicenseService } from "./license.service-core";

export {
  createLicenseService,
  type LicenseService,
  type LicenseServiceDependencies,
} from "./license.service-core";

// requireOwnerIntegrity enforces full-access owner (MFA/AAL2) and
// environment/DB owner equality before any repository is created.
const licenseService = createLicenseService({
  getRepository: async () =>
    createLicenseRepository(await createSupabaseServerClient()),
  requireOwner: requireOwnerIntegrity,
});

export const listLicenses = licenseService.listLicenses;
export const getLicense = licenseService.getLicense;
export const listLicenseTermsVersions = licenseService.listLicenseTermsVersions;
export const listLicenseAuditEvents = licenseService.listLicenseAuditEvents;
export const getProvisioningEligibility =
  licenseService.getProvisioningEligibility;
export const createLicense = licenseService.createLicense;
export const activateLicense = licenseService.activateLicense;
export const suspendLicense = licenseService.suspendLicense;
export const terminateLicense = licenseService.terminateLicense;
export const changeLicenseTerms = licenseService.changeLicenseTerms;
export const renewLicense = licenseService.renewLicense;
