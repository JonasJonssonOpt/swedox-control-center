"use server";

import "server-only";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import {
  activateTenant,
  archiveTenant,
  createTenant,
  pauseTenant,
  restoreTenant,
  updateTenant,
} from "@/lib/server/tenants";
import {
  createTenantActionCore,
  type TenantActionResult,
} from "@/lib/server/tenants/tenant-action-core";

const actions = createTenantActionCore({
  createCorrelationId: randomUUID,
  rethrowControlFlow: unstable_rethrow,
  services: {
    activateTenant,
    archiveTenant,
    createTenant,
    pauseTenant,
    restoreTenant,
    updateTenant,
  },
});

export async function createTenantAction(
  _previousState: TenantActionResult | null,
  formData: FormData,
): Promise<TenantActionResult> {
  const result = await actions.createTenant(formData);

  if (result.ok) {
    const detailPath = `/tenants/${result.tenantId}`;
    revalidatePath("/tenants");
    revalidatePath(detailPath);
    redirect(detailPath);
  }

  return result;
}

export async function updateTenantAction(
  _previousState: TenantActionResult | null,
  formData: FormData,
): Promise<TenantActionResult> {
  const result = await actions.updateTenant(formData);

  if (result.ok) {
    const detailPath = `/tenants/${result.tenantId}`;
    revalidatePath("/tenants");
    revalidatePath(detailPath);
    redirect(detailPath);
  }

  return result;
}

export async function pauseTenantAction(
  _previousState: TenantActionResult | null,
  formData: FormData,
): Promise<TenantActionResult> {
  return completeLifecycleAction(await actions.pauseTenant(formData));
}

export async function activateTenantAction(
  _previousState: TenantActionResult | null,
  formData: FormData,
): Promise<TenantActionResult> {
  return completeLifecycleAction(await actions.activateTenant(formData));
}

export async function archiveTenantAction(
  _previousState: TenantActionResult | null,
  formData: FormData,
): Promise<TenantActionResult> {
  return completeLifecycleAction(await actions.archiveTenant(formData));
}

export async function restoreTenantAction(
  _previousState: TenantActionResult | null,
  formData: FormData,
): Promise<TenantActionResult> {
  return completeLifecycleAction(await actions.restoreTenant(formData));
}

function completeLifecycleAction(
  result: TenantActionResult,
): TenantActionResult {
  if (result.ok) {
    const detailPath = `/tenants/${result.tenantId}`;
    revalidatePath("/tenants");
    revalidatePath(detailPath);
    redirect(detailPath);
  }

  return result;
}
