"use server";

import "server-only";

import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";

import {
  activateInstallation,
  archiveInstallation,
  createInstallation,
  decommissionInstallation,
  pauseInstallation,
  restoreInstallation,
  updateInstallation,
} from "@/lib/server/installations";
import {
  createInstallationActionCore,
  type InstallationActionResult,
} from "@/lib/server/installations/installation-action-core";

const actions = createInstallationActionCore({
  createCorrelationId: randomUUID,
  rethrowControlFlow: unstable_rethrow,
  services: {
    activateInstallation,
    archiveInstallation,
    createInstallation,
    decommissionInstallation,
    pauseInstallation,
    restoreInstallation,
    updateInstallation,
  },
});

export async function createInstallationAction(
  _previousState: InstallationActionResult | null,
  formData: FormData,
): Promise<InstallationActionResult> {
  return actions.createInstallation(formData);
}

export async function updateInstallationAction(
  _previousState: InstallationActionResult | null,
  formData: FormData,
): Promise<InstallationActionResult> {
  return actions.updateInstallation(formData);
}

export async function activateInstallationAction(
  _previousState: InstallationActionResult | null,
  formData: FormData,
): Promise<InstallationActionResult> {
  return actions.activateInstallation(formData);
}

export async function pauseInstallationAction(
  _previousState: InstallationActionResult | null,
  formData: FormData,
): Promise<InstallationActionResult> {
  return actions.pauseInstallation(formData);
}

export async function decommissionInstallationAction(
  _previousState: InstallationActionResult | null,
  formData: FormData,
): Promise<InstallationActionResult> {
  return actions.decommissionInstallation(formData);
}

export async function archiveInstallationAction(
  _previousState: InstallationActionResult | null,
  formData: FormData,
): Promise<InstallationActionResult> {
  return actions.archiveInstallation(formData);
}

export async function restoreInstallationAction(
  _previousState: InstallationActionResult | null,
  formData: FormData,
): Promise<InstallationActionResult> {
  return actions.restoreInstallation(formData);
}
