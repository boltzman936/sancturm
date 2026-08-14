"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Resource, ResourceType, Subject } from "./types";

export type ResourceWithSubject = Resource & {
  subject: Pick<Subject, "id" | "name" | "sort_order"> | null;
};

/** Subjects for one (branch, term) pair, ordered the way the CR arranged them. */
export function useSubjects(branchId: string | null, termId: string | null) {
  return useQuery({
    queryKey: ["subjects", branchId, termId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("branch_id", branchId!)
        .eq("term_id", termId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Subject[];
    },
    enabled: !!branchId && !!termId,
    // Subjects only change when a CR restructures the syllabus list —
    // near-static reference data, same reasoning as useBranchBySlug.
    staleTime: 5 * 60_000,
  });
}

/**
 * Every subject across every branch for one term — for PYQs, which
 * are shared cross-branch. A branch's own subject list isn't a safe
 * stand-in for "every subject a PYQ could exist under" once branches'
 * lists diverge (AIDS's 1st-Year list is entirely different from
 * AIML/Core's), so this exists instead of reusing useSubjects with
 * just the viewer's own branch.
 */
export function useSubjectsForTerm(termId: string | null) {
  return useQuery({
    queryKey: ["subjects", "term", termId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("term_id", termId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Subject[];
    },
    enabled: !!termId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Approved Notes & Lab resources for one (branch, term) pair + type
 * ('notes' or 'lab_manual'). Returned unsorted-by-intent — the page
 * does the subject-vs-time sort client-side over this same fetched
 * set, so toggling the sort control doesn't cost another round trip.
 */
export function useNotesAndLabResources(
  branchId: string | null,
  termId: string | null,
  resourceType: ResourceType,
  // Optional — a FILTER, not a scoping dimension like branch/term.
  // Omitted (null) shows every batch's content for this (branch,
  // term), which is what "browsing your year" meant before Batch
  // existed and stays the default now.
  batchId?: string | null
) {
  return useQuery({
    queryKey: ["resources", "notes_lab", branchId, termId, resourceType, batchId ?? null],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("resources")
        .select("*, subject:subjects(id, name, sort_order)")
        .eq("branch_id", branchId!)
        .eq("term_id", termId!)
        .eq("section", "notes_lab")
        .eq("resource_type", resourceType)
        .eq("status", "approved");
      if (batchId) query = query.eq("batch_id", batchId);
      const { data, error } = await query
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ResourceWithSubject[];
    },
    enabled: !!branchId && !!termId,
    staleTime: 30_000,
  });
}

/**
 * PYQs are shared across every CSE branch WITHIN a term (see
 * supabase/scope_cr_by_term.sql) — deliberately not filtered by
 * branch_id, unlike useNotesAndLabResources, but IS filtered by term
 * (a 1st-Year Sem 1 PYQ has nothing to do with a 2nd-Year Sem 3
 * student, even though a same-term PYQ crosses branches freely).
 */
export function usePyqResources(termId: string | null, batchId?: string | null) {
  return useQuery({
    queryKey: ["resources", "pyq", termId, batchId ?? null],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("resources")
        .select("*, subject:subjects(id, name, sort_order)")
        .eq("term_id", termId!)
        .eq("section", "pyq")
        .eq("status", "approved");
      if (batchId) query = query.eq("batch_id", batchId);
      const { data, error } = await query
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ResourceWithSubject[];
    },
    enabled: !!termId,
    staleTime: 30_000,
  });
}

/**
 * Titles already published in the exact scope an upload is about to
 * land in — CRUploadForm checks a picked file's would-be title against
 * this before publishing, so re-uploading something from a past
 * session (not just this same browser tab) still gets flagged. PYQ is
 * cross-branch by design (see usePyqResources), so branchIds is
 * ignored there — matches by term + subject alone, same scope PYQ
 * visibility itself uses.
 */
export function useExistingResourceTitles(
  section: "notes_lab" | "pyq" | null,
  branchIds: string[],
  termId: string | null,
  subjectId: string | null,
  // Scopes the check to the batch actually being uploaded to — the
  // same title already existing in a DIFFERENT batch isn't really a
  // duplicate (that's a different cohort's copy of the same subject).
  batchId: string | null
) {
  return useQuery({
    queryKey: ["resources", "titles", section, branchIds, termId, subjectId, batchId],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("resources")
        .select("title")
        .eq("term_id", termId!)
        .eq("batch_id", batchId!)
        .eq("section", section!)
        .eq("status", "approved");
      if (section === "notes_lab") query = query.in("branch_id", branchIds);
      query = subjectId ? query.eq("subject_id", subjectId) : query.is("subject_id", null);
      const { data, error } = await query;
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.title.trim().toLowerCase()));
    },
    enabled: !!termId && !!batchId && !!section && (section === "pyq" || branchIds.length > 0),
    staleTime: 15_000,
  });
}

/** Fire-and-forget counter bump — matches increment_resource_counter's
 * "only these two columns" guard in the migration. One hook covers
 * both download_count (Download button) and view_count (View/preview
 * button) since they're the exact same RPC call with a different
 * column name. */
export function useIncrementResourceCounter(columnName: "download_count" | "view_count") {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (resourceId: string) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("increment_resource_counter", {
        target_id: resourceId,
        column_name: columnName,
        amount: 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Broad "resources" prefix, not just "notes_lab" — this same
      // counter bump also fires from the PYQ page's Download/View.
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}
