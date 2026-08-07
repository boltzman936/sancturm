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
        .select("branch_id, display_name")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (cr) return { type: "cr", branchId: cr.branch_id, displayName: cr.display_name };

      return null;
    },
    staleTime: 5 * 60_000,
  });
}
