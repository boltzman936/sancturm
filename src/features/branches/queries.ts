"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Branch, Specialization } from "./types";

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

/**
 * Every specialization for a given branch — empty for any branch with
 * no specialization concept (has_specializations = false), 4 rows for
 * CSE today. Scoped by branchId (not fetched all-at-once like
 * useBranches) since, unlike branches, specializations only ever
 * matter in the context of one already-chosen branch — nothing needs
 * "every specialization across every branch" at once.
 */
export function useSpecializations(branchId: string | null) {
  return useQuery({
    queryKey: ["specializations", branchId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("specializations")
        .select("*")
        .eq("branch_id", branchId as string)
        .order("sort_order");
      if (error) throw error;
      return data as Specialization[];
    },
    enabled: !!branchId,
    staleTime: 5 * 60_000,
  });
}

/** Resolves the slug stored by useSpecialization() into the actual row — same reasoning as useBranchBySlug. */
export function useSpecializationBySlug(branchId: string | null, slug: string | null) {
  const query = useSpecializations(branchId);
  return { ...query, data: slug ? query.data?.find((s) => s.slug === slug) : undefined };
}