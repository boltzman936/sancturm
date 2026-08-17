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
 * termId also accepts an array — same "All semesters" case
 * useNotesAndLabResources/usePyqResources support, driven by the same
 * useBatchSemesterFilter hook, so a notice posted for a SPECIFIC
 * semester (not just whichever one the sidebar's Year switcher
 * currently resolves to) is still genuinely reachable/browsable, not
 * just correctly scoped in the query.
 *
 * batchId is an optional FILTER (not a scoping dimension) — omitted
 * shows every batch's notices for this (branch, specialization, term),
 * matching useNotesAndLabResources' identical optional-batch pattern.
 */
export function useNotices(
  branchId: string | null,
  specializationId: string | null,
  hasSpecializations: boolean,
  termId: string | string[] | null,
  batchId?: string | null
) {
  const termKey = Array.isArray(termId) ? [...termId].sort() : termId;
  const hasTerm = Array.isArray(termId) ? termId.length > 0 : !!termId;
  return useQuery({
    queryKey: ["notices", branchId, specializationId, termKey, batchId ?? null],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from("notices").select("*").eq("branch_id", branchId!);
      query = Array.isArray(termId) ? query.in("term_id", termId) : query.eq("term_id", termId!);
      query = hasSpecializations ? query.eq("specialization_id", specializationId!) : query.is("specialization_id", null);
      if (batchId) query = query.eq("batch_id", batchId);
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
