import "server-only";

import { redirect } from "next/navigation";

import { getOwnerAuthorization } from "./get-owner-authorization";

export type AuthorizedOwner = Readonly<{
  aal: "aal1" | "aal2" | null;
  role: "owner";
  userId: string;
}>;

export async function requireAuthorizedOwner(): Promise<AuthorizedOwner> {
  const authorization = await getOwnerAuthorization();

  if (authorization.status === "unauthenticated") {
    redirect("/login");
  }

  if (authorization.status === "not_owner") {
    redirect("/auth/unauthorized");
  }

  return Object.freeze({
    aal: authorization.aal,
    role: authorization.role,
    userId: authorization.userId,
  });
}
