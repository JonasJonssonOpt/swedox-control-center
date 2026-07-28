import "server-only";

import { cookies } from "next/headers";

const PENDING_FACTOR_COOKIE = "swedox_mfa_pending_factor";
const FACTOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getPendingMfaFactorId(): Promise<string | undefined> {
  const value = (await cookies()).get(PENDING_FACTOR_COOKIE)?.value;
  return value && FACTOR_ID_PATTERN.test(value) ? value : undefined;
}

export async function setPendingMfaFactorId(factorId: string): Promise<void> {
  if (!FACTOR_ID_PATTERN.test(factorId)) {
    throw new Error("Invalid MFA factor identifier.");
  }

  (await cookies()).set(PENDING_FACTOR_COOKIE, factorId, {
    httpOnly: true,
    maxAge: 15 * 60,
    path: "/auth/mfa/enroll",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearPendingMfaFactorId(): Promise<void> {
  (await cookies()).set(PENDING_FACTOR_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/auth/mfa/enroll",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}
