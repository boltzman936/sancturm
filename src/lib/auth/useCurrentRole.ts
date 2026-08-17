"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "./role";

export function useCurrentRole() {
  return useQuery({
    queryKey: ["current-role"],
    queryFn: async (): Promise<Role> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: admin } = await supabase
        .from("admins")
        .select("display_name")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (admin) return { type: "admin", displayName: admin.display_name };

      const { data: cr } = await supabase
        .from("cr_profiles")
        .select("branch_id, specialization_id, year_number, batch_id, display_name")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (cr) {
        // Same resolution role.ts's server-side getCurrentRole() does,
        // via the identical Postgres function — see its own comment
        // for why this can't just be a stored column.
        const { data: termId, error } = await supabase.rpc("cr_current_term_id", {
          p_batch_id: cr.batch_id,
          p_year_number: cr.year_number,
          p_specialization_id: cr.specialization_id,
        });
        if (error || !termId) {
          console.error("cr_current_term_id resolution failed:", error);
          return null;
        }
        return {
          type: "cr",
          branchId: cr.branch_id,
          specializationId: cr.specialization_id,
          termId,
          batchId: cr.batch_id,
          displayName: cr.display_name,
        };
      }

      return null;
    },
    staleTime: 5 * 60_000,
  });
}
