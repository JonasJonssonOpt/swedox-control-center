"use server";

import "server-only";

import { clearAuthCookiesAtScopes } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireAuthorizedOwner } from "@/lib/server/auth";
import { recordMfaAuditEvent } from "@/lib/server/audit/mfa-audit";
import { getSupabasePublicEnvironment } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function clearLocalAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  const { url } = getSupabasePublicEnvironment();
  const projectReference = new URL(url).hostname.split(".")[0];
  const storageKey = `sb-${projectReference}-auth-token`;

  await clearAuthCookiesAtScopes({
    getAll() {
      return cookieStore.getAll();
    },
    scopes: [{}],
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, options, value }) => {
        cookieStore.set(name, value, options);
      });
    },
    storageKey,
  });
}

export async function logout(): Promise<never> {
  const owner = await requireAuthorizedOwner();
  let remoteSignOutSucceeded = false;
  let localCookiesCleared = false;

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "global" });
    remoteSignOutSucceeded = !error;
  } catch {
    remoteSignOutSucceeded = false;
  }

  try {
    await clearLocalAuthCookies();
    localCookiesCleared = true;
  } catch {
    localCookiesCleared = false;
  }

  recordMfaAuditEvent(
    remoteSignOutSucceeded && localCookiesCleared
      ? "logout_completed"
      : "logout_failed",
    owner.userId,
  );

  redirect("/login");
}
