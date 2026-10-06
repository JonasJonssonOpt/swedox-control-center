"use server";

import "server-only";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import {
  activateLicense,
  changeLicenseTerms,
  createLicense,
  renewLicense,
  suspendLicense,
  terminateLicense,
} from "@/lib/server/licenses";
import {
  createLicenseActionCore,
  type LicenseActionResult,
} from "@/lib/server/licenses/license-action-core";

const actions = createLicenseActionCore({
  createCorrelationId: randomUUID,
  rethrowControlFlow: unstable_rethrow,
  services: {
    activateLicense,
    changeLicenseTerms,
    createLicense,
    renewLicense,
    suspendLicense,
    terminateLicense,
  },
});

export async function createLicenseAction(
  _previousState: LicenseActionResult | null,
  formData: FormData,
): Promise<LicenseActionResult> {
  return completeFormAction(await actions.createLicense(formData));
}

export async function changeLicenseTermsAction(
  _previousState: LicenseActionResult | null,
  formData: FormData,
): Promise<LicenseActionResult> {
  return completeFormAction(await actions.changeLicenseTerms(formData));
}

export async function activateLicenseAction(
  _previousState: LicenseActionResult | null,
  formData: FormData,
): Promise<LicenseActionResult> {
  return completeFormAction(await actions.activateLicense(formData));
}

export async function suspendLicenseAction(
  _previousState: LicenseActionResult | null,
  formData: FormData,
): Promise<LicenseActionResult> {
  return completeFormAction(await actions.suspendLicense(formData));
}

export async function terminateLicenseAction(
  _previousState: LicenseActionResult | null,
  formData: FormData,
): Promise<LicenseActionResult> {
  return completeFormAction(await actions.terminateLicense(formData));
}

export async function renewLicenseAction(
  _previousState: LicenseActionResult | null,
  formData: FormData,
): Promise<LicenseActionResult> {
  return completeFormAction(await actions.renewLicense(formData));
}

// Success-only revalidation of list and detail, then the fresh detail.
function completeFormAction(result: LicenseActionResult): LicenseActionResult {
  if (result.ok) {
    const detailPath = `/licenses/${result.licenseId}`;
    revalidatePath("/licenses");
    revalidatePath(detailPath);
    redirect(detailPath);
  }

  return result;
}
