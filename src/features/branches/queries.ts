"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Branch } from "./types";

/**
 * Every branch that exists, straight from the database — this is what
 * makes adding a new branch/department a one-row INSERT instead of a
 * code change. BranchSelectCard (onboarding) and BranchSwitcher
 * (sidebar) both read from this instead of a hardcoded list; anything
 * added to the `branches` table shows up in both automatically, no
 * redeploy needed.
 */
export function useBranches() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("branches").select("*").order("sort_order");
      if (error) throw error;
      return data as Branch[];
    },
    // Same reasoning as useBranchBySlug below — branches are near-static
    // reference data.
    staleTime: 5 * 60_000,
  });
}

/**
 * Resolves the slug stored by useBranch() (e.g. "cse-aiml") into the
 * actual branch row — every other query needs the real branch_id, not
 * the slug, to filter its table.
 *
 * Built on useBranches() rather than its own fetch-by-slug query —
 * branches is 3 rows, so there's never a reason to fetch "just one"
 * separately. The old version had its own ["branch", slug] query, a
 * SECOND network round trip stacked after the branch switcher's own
 * useBranches() call (which fetches this exact data first, to render
 * its own option list) — every branch switch paid for two sequential
 * fetches for data the app already had in hand a moment earlier. This
 * way there's exactly one underlying query (["branches"]), shared and
 * deduped by every caller, so switching branch resolves from cache
 * instantly instead of waiting on a fresh network hop.
 */
export function useBranchBySlug(slug: string | null) {
  const query = useBranches();
  return { ...query, data: slug ? query.data?.find((b) => b.slug === slug) : undefined };
}