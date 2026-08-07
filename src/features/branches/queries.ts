"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Branch } from "./types";

/**
 * Resolves the slug stored by useBranch() (e.g. "cse-aiml") into the
 * actual branch row — every other query needs the real branch_id, not
 * the slug, to filter its table.
 */
export function useBranchBySlug(slug: string | null) {
  return useQuery({
    queryKey: ["branch", slug],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data as Branch;
    },
    enabled: !!slug,
    // Branches are near-static reference data — no reason to refetch
    // just because a few minutes passed since the last lookup.
    staleTime: 5 * 60_000,
  });
}