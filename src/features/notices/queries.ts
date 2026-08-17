"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Notice } from "./types";

/**
 * Notices for one (branch, specialization, term) combination, newest
 * first — public read, no approval workflow (unlike resources: only a
 * CR/admin can ever write one, so there's nothing to review).
 * Notices have no PYQ-style cross-specialization sharing (see
 * supabase/expand_branch_hierarchy.sql's notices RLS — always matches
 * specialization_id exactly, never a pool), so a CSE student only ever
 * sees their own specialization's notices, never a sibling
 * specialization's. specializationId null matches specialization_id
 * is null (every non-CSE branch).
 */
export function useNotices(
  branchId: string | null,
  specializationId: string | null,
  hasSpecializations: boolean,
  termId: string | null
) {
  return useQuery({
    queryKey: ["notices", branchId, specializationId, termId],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from("notices").select("*").eq("branch_id", branchId!).eq("term_id", termId!);
      query = hasSpecializations ? query.eq("specialization_id", specializationId!) : query.is("specialization_id", null);
      const { data, error } = await query
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Notice[];
    },
    enabled: !!branchId && !!termId && (!hasSpecializations || !!specializationId),
    staleTime: 30_000,
  });
}
