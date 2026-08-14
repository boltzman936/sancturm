"use client";

import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useBranches } from "@/features/branches/queries";
import { useTerms } from "@/features/terms/queries";
import { resolveSubjectBranchName } from "./subjectInterchange";
import type { Resource, ResourceType, Subject, SubjectStructureConfig } from "./types";

export type ResourceWithSubject = Resource & {
  subject: Pick<Subject, "id" | "name" | "sort_order"> | null;
};

/**
 * The 1st-Year Sem 2 subject-interchange toggle — a single row,
 * public read (every browser needs it to resolve the right subject
 * list), admin-only write (see subjectInterchange/actions.ts).
 */
export function useSubjectStructureConfig() {
  return useQuery({
    queryKey: ["subject-structure-config"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("subject_structure_config").select("*").single();
      if (error) throw error;
      return data as SubjectStructureConfig;
    },
    staleTime: 60_000,
  });
}

/**
 * Subjects for one (branch, term) pair, ordered the way the CR
 * arranged them. Resolves through resolveSubjectBranchName first —
 * for every term except 1st-Year Sem 2 (or whenever the interchange
 * toggle is off) this is exactly branchId, unchanged; the swap only
 * ever kicks in for that one semester. Callers never need to know
 * interchange exists at all — they ask for "this branch's subjects"
 * and get the currently-active list back, same call shape as before.
 */
export function useSubjects(branchId: string | null, termId: string | null) {
  const { data: branches } = useBranches();
  const { data: terms } = useTerms();
  const { data: config } = useSubjectStructureConfig();

  const effectiveBranchId = useMemo(() => {
    if (!branchId || !termId || !branches || !terms || !config) return branchId;
    const term = terms.find((t) => t.id === termId);
    const branch = branches.find((b) => b.id === branchId);
    if (!term || !branch) return branchId;
    const resolvedName = resolveSubjectBranchName(branch.name, term.slug, config.interchange_active);
    return branches.find((b) => b.name === resolvedName)?.id ?? branchId;
  }, [branchId, termId, branches, terms, config]);

  return useQuery({
    queryKey: ["subjects", effectiveBranchId, termId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("branch_id", effectiveBranchId!)
        .eq("term_id", termId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Subject[];
    },
    enabled: !!effectiveBranchId && !!termId,
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
 * Every subject across every branch, for a SET of terms — Manage's
 * Year filter is coarser than one term id (a year can span more than
 * one semester, per the Batch/Semester feature), and "All years" means
 * every term, so a single termId hook can't cover it. Same query-key
 * shape as useSubjectsForTerm (["subjects", "term", termId]) so this
 * shares cache entries with it instead of double-fetching. Uses
 * useQueries (not a loop of useSubjectsForTerm calls, which would
 * violate rules of hooks against a dynamic-length term list) — fires
 * every term's query in parallel, not a sequential waterfall.
 */
export function useSubjectsForTerms(termIds: string[]) {
  const results = useQueries({
    queries: termIds.map((termId) => ({
      queryKey: ["subjects", "term", termId],
      queryFn: async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("subjects")
          .select("*")
          .eq("term_id", termId)
          .order("sort_order", { ascending: true });
        if (error) throw error;
        return data as Subject[];
      },
      staleTime: 5 * 60_000,
    })),
  });

  const isLoading = results.some((r) => r.isLoading);
  const data = isLoading ? undefined : results.flatMap((r) => r.data ?? []);
  return { data, isLoading };
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
export function usePyqResources(
  termId: string | null,
  // Which branches' PYQs are actually visible together — resolved by
  // the caller via pyqSharing.ts's pyqSharingBranchNames (1st Year
  // splits Core+AIML from AIDS; 2nd Year stays fully shared). This is
  // the actual enforcement point: a student's browser never sees a
  // PYQ outside their own sharing group, because the query itself
  // never fetches it — not a client-side filter over an already-
  // fetched full set.
  branchIds: string[] | null,
  batchId?: string | null
) {
  return useQuery({
    queryKey: ["resources", "pyq", termId, branchIds ? [...branchIds].sort() : null, batchId ?? null],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("resources")
        .select("*, subject:subjects(id, name, sort_order)")
        .eq("term_id", termId!)
        .eq("section", "pyq")
        .eq("status", "approved")
        .in("branch_id", branchIds!);
      if (batchId) query = query.eq("batch_id", batchId);
      const { data, error } = await query
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ResourceWithSubject[];
    },
    enabled: !!termId && !!branchIds && branchIds.length > 0,
    staleTime: 30_000,
  });
}

/**
 * Titles already published in the exact scope an upload is about to
 * land in — CRUploadForm checks a picked file's would-be title against
 * this before publishing, so re-uploading something from a past
 * session (not just this same browser tab) still gets flagged.
 * branchIds is always applied now, PYQ included — for a PYQ upload the
 * caller passes the full pyqSharing.ts group (not just the one branch
 * on record), since a same-named PYQ in a DIFFERENT sharing group
 * (e.g. AIDS vs. Core/AIML for 1st Year) isn't actually a duplicate
 * anymore, matching what usePyqResources itself now shows.
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
        .eq("status", "approved")
        .in("branch_id", branchIds);
      query = subjectId ? query.eq("subject_id", subjectId) : query.is("subject_id", null);
      const { data, error } = await query;
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.title.trim().toLowerCase()));
    },
    enabled: !!termId && !!batchId && !!section && branchIds.length > 0,
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
