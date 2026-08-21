"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/date";
import { isDateReached } from "./academicChronology";
import type { Batch, BatchTerm } from "./types";

/**
 * Every batch (admission cohort) that exists — same "database is the
 * source of truth, adding a new one is an INSERT, not a code change"
 * reasoning as useBranches()/useTerms(). BatchSwitcher and the upload
 * form's Batch picker both read from this.
 */
export function useBatches() {
  return useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const supabase = createClient();
      // Newest first — sort_order ascends with start_year (see
      // add_batches.sql), so descending here means the latest cohort
      // is always first, everywhere this list is rendered as options.
      const { data, error } = await supabase.from("batches").select("*").order("sort_order", { ascending: false });
      if (error) throw error;
      return data as Batch[];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Which batches actually offer a given term (year+semester) — the
 * reverse lookup of useBatchTerms, for the Upload form's admin-only
 * Batch picker: given the Year/Semester already picked (Edit's own
 * "Year" field, which is really a direct term picker — see
 * EditResourceButton), only offer batches that have actually REACHED
 * that semester yet — a brand-new batch with only a 1st-Year-Sem-1 row
 * shouldn't be pickable while Sem 2 is selected, and neither should a
 * batch whose row for this term exists but hasn't started (the same
 * isDateReached check every other date-filtered dropdown uses). Purely
 * a UX narrowing — updateResourceFields/updateNoticeFields re-check
 * this same pairing server-side regardless, since Edit is the one flow
 * that lets an admin retarget to ANY branch/term/batch.
 */
export function useBatchesForTerm(termId: string | null) {
  return useQuery({
    queryKey: ["batches", "for-term", termId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("batch_terms")
        .select("start_date, batch:batches(*)")
        .eq("term_id", termId!);
      if (error) throw error;
      const todayKey = localDateKey(new Date().toISOString());
      const batches = (data ?? [])
        .filter((row) => isDateReached(row.start_date, todayKey))
        .map((row) => (Array.isArray(row.batch) ? row.batch[0] : row.batch))
        .filter((b): b is Batch => !!b);
      // Newest first, same reasoning as useBatches().
      return batches.sort((a, b) => b.sort_order - a.sort_order);
    },
    enabled: !!termId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Which (curriculum-slot) terms actually exist for one batch, plus
 * their real dates — this is what makes a dependent filter ("1st Year
 * -> 2025-26" should only offer the semesters that batch actually
 * has) driven by real data instead of hardcoded year/semester logic.
 * A batch with only a 1st-Year Sem 1 row (a brand-new batch) correctly
 * offers just that one semester; one further along offers all of them.
 */
export function useBatchTerms(batchId: string | null) {
  return useQuery({
    queryKey: ["batch-terms", batchId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("batch_terms")
        .select("*, term:academic_terms(*)")
        .eq("batch_id", batchId!)
        .order("start_date");
      if (error) throw error;
      return data as unknown as (BatchTerm & { term: import("@/types/database").AcademicTerm })[];
    },
    enabled: !!batchId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Every (batch, term) pairing that exists, across every batch — the
 * unscoped version of useBatchTerms, for "All batches" contexts (Notes/
 * PYQs' Batch filter) where Semester options need the UNION of what
 * every batch has reached, not just one batch's own list.
 */
export function useAllBatchTerms() {
  return useQuery({
    queryKey: ["batch-terms", "all"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("batch_terms")
        .select("*, term:academic_terms(*)")
        .order("start_date");
      if (error) throw error;
      return data as unknown as (BatchTerm & { term: import("@/types/database").AcademicTerm })[];
    },
    staleTime: 5 * 60_000,
  });
}
