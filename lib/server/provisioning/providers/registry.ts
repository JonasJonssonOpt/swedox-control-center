import "server-only";

import { createManualStepProvider } from "./manual-provider";
import {
  PROVISIONING_STEP_KEYS,
  type ProvisioningStepKey,
  type ProvisioningStepProvider,
} from "./provider.types";

// One provider per catalog step, in catalog order. Every step is manual in 1.0.
const PROVIDERS: readonly ProvisioningStepProvider[] = Object.freeze(
  PROVISIONING_STEP_KEYS.map((stepKey, index) =>
    createManualStepProvider(stepKey, index + 1),
  ),
);

export function listProvisioningStepProviders(): readonly ProvisioningStepProvider[] {
  return PROVIDERS;
}

export function getProvisioningStepProvider(
  stepKey: string,
): ProvisioningStepProvider {
  const provider = PROVIDERS.find((item) => item.stepKey === stepKey);
  // Unknown keys mean catalog drift between DB and code: fail closed.
  if (!provider) throw new Error("unknown_provisioning_step");
  return provider;
}

export function isProvisioningStepKey(
  value: unknown,
): value is ProvisioningStepKey {
  return PROVISIONING_STEP_KEYS.some((key) => key === value);
}
