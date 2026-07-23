import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VerifiedAuthClaims = Readonly<{
  aal: "aal1" | "aal2" | null;
  subject: string;
}>;

export async function getVerifiedClaims(): Promise<VerifiedAuthClaims | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();

    const subject = data?.claims.sub;

    if (error || typeof subject !== "string" || !subject) {
      return null;
    }

    let aal: VerifiedAuthClaims["aal"] = null;

    if (data.claims.aal === "aal1") {
      aal = "aal1";
    } else if (data.claims.aal === "aal2") {
      aal = "aal2";
    }

    return Object.freeze({ aal, subject });
  } catch {
    return null;
  }
}
