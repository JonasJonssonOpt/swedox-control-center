import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getVerifiedClaims() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return null;
  }

  return data?.claims ?? null;
}
