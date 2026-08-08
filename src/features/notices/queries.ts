"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Notice } from "./types";

/** Notices for one (branch, term) pair, newest first — public read, no
 * approval workflow (unlike resources: only a CR/admin can ever write
 * one, so there's nothing to review). */
export function useNotices(branchId: string | null, termId: string | null) {
  return useQuery({
    queryKey: ["notices", branchId, termId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("notices")
        .select("*")
        .eq("branch_id", branchId!)
        .eq("term_id", termId!)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Notice[];
    },
    enabled: !!branchId && !!termId,
    staleTime: 30_000,
  });
}
