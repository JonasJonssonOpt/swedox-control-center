import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { requireFullAccessOwner } from "./require-full-access-owner";
import {
  checkOwnerIntegrity,
  type OwnerIntegrityResult,
} from "./owner-integrity.contract";

export async function getOwnerIntegrity(): Promise<OwnerIntegrityResult> {
  return checkOwnerIntegrity({
    environmentValue: process.env.CONTROL_CENTER_OWNER_USER_ID,
    getDatabaseStatus: async () => {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.rpc("get_owner_integrity_status");

      if (error) {
        throw new Error("Owner integrity RPC failed.");
      }

      return data;
    },
    requireOwner: requireFullAccessOwner,
  });
}
