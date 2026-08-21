"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Notice } from "./types";

/**
 * Notices for one (branch, specialization, term[s]) combination,
 * newest first — public read, no approval workflow (unlike resources:
 * only a CR/admin can ever write one, so there's nothing to review).
 * Notices have no PYQ-style cross-specialization sharing (see
 * supabase/expand_branch_hierarchy.sql's notices RLS — always matches
 * specialization_id exactly, never a pool), so a CSE student only ever
 * sees their own specialization's notices, never a sibling
 * specialization's. specializationId null matches specialization_id
 * is null (every non-CSE branch).
 *
 * No Batch/Semester/Year filter of any kind — a notice is scoped
 * purely by Branch + Specialization + termId, matching a real
 * notice's meaning (a live announcement for whoever's in that academic
 * context right now), not an archival, per-cohort resource like
 * Notes/PYQ. This hook has no notion of "current" itself; callers
 * resolve termId through useCurrentNoticeTermId (see
 * currentSemester.ts) — a small fixed map of the two Notice contexts
 * that actually exist right now, not a date computation. termId still
 * accepts an array for signature parity with the other resource
 * hooks, but nothing in the Notice flow ever passes more than one.
 */
export function useNotices(
  branchId: string | null,
  specializationId: string | null,
  hasSpecializations: boolean,
  termId: string | string[] | null
) {
  const termKey = Array.isArray(termId) ? [...termId].sort() : termId;
  const hasTerm = Array.isArray(termId) ? termId.length > 0 : !!termId;
  return useQuery({
    queryKey: ["notices", branchId, specializationId, termKey],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from("notices").select("*").eq("branch_id", branchId!);
      query = Array.isArray(termId) ? query.in("term_id", termId) : query.eq("term_id", termId!);
      query = hasSpecializations ? query.eq("specialization_id", specializationId!) : query.is("specialization_id", null);
      const { data, error } = await query
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Notice[];
    },
    enabled: !!branchId && hasTerm && (!hasSpecializations || !!specializationId),
    staleTime: 30_000,
  });
}
