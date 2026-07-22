import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnvironment } from "./env";

export function createSupabaseBrowserClient() {
  const { publishableKey, url } = getSupabasePublicEnvironment();

  return createBrowserClient(url, publishableKey);
}
