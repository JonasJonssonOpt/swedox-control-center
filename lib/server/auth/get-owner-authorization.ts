import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getVerifiedClaims } from "./get-verified-claims";
import { getOwnerEnvironment } from "./owner-integrity.contract";

export type OwnerAuthorization =
  | Readonly<{ status: "unauthenticated" }>
  | Readonly<{ status: "not_owner" }>
  | Readonly<{
      aal: "aal1" | "aal2" | null;
      role: "owner";
      status: "authorized";
      userId: string;
    }>;

function getConfiguredOwnerUserId(): string | null {
  const result = getOwnerEnvironment(process.env.CONTROL_CENTER_OWNER_USER_ID);

  if (!result.ok) {
    return null;
  }

  return result.userId;
}

export async function getOwnerAuthorization(): Promise<OwnerAuthorization> {
  const ownerUserId = getConfiguredOwnerUserId();

  if (!ownerUserId) {
    return { status: "not_owner" };
  }

  const claims = await getVerifiedClaims();

  if (!claims) {
    return { status: "unauthenticated" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    const currentUserId = data.user?.id;

    if (
      error ||
      typeof currentUserId !== "string" ||
      !getOwnerEnvironment(claims.subject).ok ||
      !getOwnerEnvironment(currentUserId).ok ||
      claims.subject.toLowerCase() !== currentUserId.toLowerCase()
    ) {
      return { status: "unauthenticated" };
    }

    if (currentUserId.toLowerCase() !== ownerUserId) {
      return { status: "not_owner" };
    }

    return Object.freeze({
      aal: claims.aal,
      role: "owner",
      status: "authorized",
      userId: currentUserId,
    });
  } catch {
    return { status: "unauthenticated" };
  }
}
