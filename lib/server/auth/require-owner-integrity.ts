import "server-only";

import { redirect } from "next/navigation";

import { getOwnerIntegrity } from "./get-owner-integrity";
import { recordOwnerIntegrityFailure } from "./owner-integrity.errors";

export type IntegrityVerifiedOwner = Readonly<{
  userId: string;
}>;

export async function requireOwnerIntegrity(): Promise<IntegrityVerifiedOwner> {
  const result = await getOwnerIntegrity();

  if (!result.ok) {
    recordOwnerIntegrityFailure(result.code);
    redirect("/auth/security-error");
  }

  return Object.freeze({ userId: result.userId });
}
