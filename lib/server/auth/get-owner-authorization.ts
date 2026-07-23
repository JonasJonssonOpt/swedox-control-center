import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getVerifiedClaims } from "./get-verified-claims";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const value = process.env.CONTROL_CENTER_OWNER_USER_ID?.trim();

  if (!value || !UUID_PATTERN.test(value)) {
    return null;
  }

  return value.toLowerCase();
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
      !UUID_PATTERN.test(claims.subject) ||
      !UUID_PATTERN.test(currentUserId) ||
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
