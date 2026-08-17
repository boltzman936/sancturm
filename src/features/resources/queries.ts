"use client";

import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSpecializations } from "@/features/branches/queries";
import { useTerms } from "@/features/terms/queries";
import { resolveSubjectQueryTermSlug, resolveSubjectSpecializationName } from "./subjectInterchange";
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
 * Subjects for one (branch, specialization, term) combination, ordered
 * the way the CR arranged them. specializationId is null for any
 * branch with no specialization concept (everything but CSE) — those
 * subjects are matched with `specialization_id is null`.
 *
 * For CSE, resolves through resolveSubjectSpecializationName AND
 * resolveSubjectQueryTermSlug first — for every term except 1st-Year
 * Sem 2 this is exactly (specializationId, termId), unchanged. For
 * Core/AIML/AIDS's Sem 2 specifically, the query is always redirected
 * to Sem 1's real subject rows (there is no separately-maintained Sem
 * 2 list — it was never created, by design), with the specialization
 * ALWAYS swapped (AIDS <-> Core/AIML — not admin-togglable, see
 * subjectInterchange.ts). Cyber Security and every non-CSE branch pass
 * through both resolvers unchanged. Callers never need to know
 * interchange/redirect exists at all — they ask for "this
 * specialization's subjects at this term" and get the currently-active
 * list back, same call shape as before.
 */
export function useSubjects(branchId: string | null, specializationId: string | null, termId: string | null) {
  const { data: specializations } = useSpecializations(branchId);
  const { data: terms } = useTerms();

  const effectiveSpecializationId = useMemo(() => {
    if (!specializationId || !termId || !specializations || !terms) return specializationId;
    const term = terms.find((t) => t.id === termId);
    const spec = specializations.find((s) => s.id === specializationId);
    if (!term || !spec) return specializationId;
    const resolvedName = resolveSubjectSpecializationName(spec.name, term.slug);
    return specializations.find((s) => s.name === resolvedName)?.id ?? specializationId;
  }, [specializationId, termId, specializations, terms]);

  const effectiveTermId = useMemo(() => {
    if (!termId || !specializationId || !specializations || !terms) return termId;
    const term = terms.find((t) => t.id === termId);
    const spec = specializations.find((s) => s.id === specializationId);
    if (!term || !spec) return termId;
    const resolvedSlug = resolveSubjectQueryTermSlug(spec.name, term.slug);
    return terms.find((t) => t.slug === resolvedSlug)?.id ?? termId;
  }, [termId, specializationId, specializations, terms]);

  return useQuery({
    queryKey: ["subjects", branchId, effectiveSpecializationId, effectiveTermId],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from("subjects").select("*").eq("branch_id", branchId!).eq("term_id", effectiveTermId!);
      query = effectiveSpecializationId
        ? query.eq("specialization_id", effectiveSpecializationId)
        : query.is("specialization_id", null);
      const { data, error } = await query.order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Subject[];
    },
    enabled: !!branchId && !!effectiveTermId,
    // Subjects only change when a CR restructures the syllabus list —
    // near-static reference data, same reasoning as useBranchBySlug.
    staleTime: 5 * 60_000,
  });
}

/**
 * Every subject across every branch AND specialization for one term —
 * Manage's admin-wide "All years" filter genuinely wants everything,
 * since admin manages every branch at once. Not used for PYQ's own
 * subject filter (see useSubjectsForPyqScope below) — a student's PYQ
 * view should only ever see subjects from their own branch's sharing
 * pool, not every branch in the college.
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
 * Every subject in a branch's PYQ sharing pool (see pyqSharing.ts) for
 * one term — the PYQs page's own Subject filter, scoped to exactly the
 * same (branch, specializations) set usePyqResources itself queries,
 * so the filter never offers a subject that couldn't actually appear
 * in what's shown. specializationIds is the pool from
 * pyqSharingSpecializationIds — empty means "branch has no
 * specialization concept", matched as specialization_id is null.
 */
export function useSubjectsForPyqScope(
  branchId: string | null,
  specializationIds: string[],
  hasSpecializations: boolean,
  termId: string | null
) {
  return useQuery({
    queryKey: ["subjects", "pyq-scope", branchId, [...specializationIds].sort(), termId],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from("subjects").select("*").eq("branch_id", branchId!).eq("term_id", termId!);
      query = hasSpecializations ? query.in("specialization_id", specializationIds) : query.is("specialization_id", null);
      const { data, error } = await query.order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Subject[];
    },
    enabled: !!branchId && !!termId && (!hasSpecializations || specializationIds.length > 0),
    staleTime: 5 * 60_000,
  });
}

/** Same as useSubjectsForPyqScope, for a SET of terms — PYQs page's own "All semesters" case. */
export function useSubjectsForPyqScopeTerms(
  branchId: string | null,
  specializationIds: string[],
  hasSpecializations: boolean,
  termIds: string[]
) {
  const results = useQueries({
    queries: termIds.map((termId) => ({
      queryKey: ["subjects", "pyq-scope", branchId, [...specializationIds].sort(), termId],
      queryFn: async () => {
        const supabase = createClient();
        let query = supabase.from("subjects").select("*").eq("branch_id", branchId!).eq("term_id", termId);
        query = hasSpecializations
          ? query.in("specialization_id", specializationIds)
          : query.is("specialization_id", null);
        const { data, error } = await query.order("sort_order", { ascending: true });
        if (error) throw error;
        return data as Subject[];
      },
      enabled: !!branchId && (!hasSpecializations || specializationIds.length > 0),
      staleTime: 5 * 60_000,
    })),
  });

  const isLoading = termIds.length > 0 && results.some((r) => r.isLoading);
  const data = isLoading ? undefined : results.flatMap((r) => r.data ?? []);
  return { data, isLoading };
}

/**
 * Notes & Lab's own "All semesters" case (see useBatchSemesterFilter's
 * ALL_SEMESTERS) — the branch/specialization-scoped equivalent of
 * useSubjectsForTerms above, which is deliberately unscoped for
 * Manage's admin-wide filter and so isn't reusable here as-is.
 * Resolves interchange PER TERM, the same way useSubjects does for a
 * single term — a union spanning 1st-Year Sem 1 and Sem 2 needs Sem
 * 2's own resolution, not the requesting specialization's raw id
 * applied to every term uniformly. Shares useSubjects' exact query key
 * shape per term, so results aren't double-fetched.
 *
 * Also redirects Sem 2's term the same way useSubjects does — for
 * Core/AIML/AIDS a union spanning Sem 1 and Sem 2 would otherwise fetch
 * the same Sem 1 rows twice (once as themselves, once as Sem 2's
 * redirect target), so results are de-duplicated by subject id after
 * fetching.
 */
export function useSubjectsForBranchAndTerms(
  branchId: string | null,
  specializationId: string | null,
  termIds: string[]
) {
  const { data: specializations } = useSpecializations(branchId);
  const { data: terms } = useTerms();
  const spec = specializations?.find((s) => s.id === specializationId);
  const ready = !!branchId && (!specializationId || (!!specializations && !!terms));

  const results = useQueries({
    queries: termIds.map((termId) => {
      const term = terms?.find((t) => t.id === termId);
      const effectiveSpecializationId =
        specializationId && ready && spec && term
          ? specializations!.find((s) => s.name === resolveSubjectSpecializationName(spec.name, term.slug))?.id ??
            specializationId
          : specializationId;
      const effectiveTermId =
        specializationId && ready && spec && term
          ? terms!.find((t) => t.slug === resolveSubjectQueryTermSlug(spec.name, term.slug))?.id ?? termId
          : termId;
      return {
        queryKey: ["subjects", branchId, effectiveSpecializationId, effectiveTermId],
        queryFn: async () => {
          const supabase = createClient();
          let query = supabase.from("subjects").select("*").eq("branch_id", branchId!).eq("term_id", effectiveTermId);
          query = effectiveSpecializationId
            ? query.eq("specialization_id", effectiveSpecializationId)
            : query.is("specialization_id", null);
          const { data, error } = await query.order("sort_order", { ascending: true });
          if (error) throw error;
          return data as Subject[];
        },
        enabled: ready,
        staleTime: 5 * 60_000,
      };
    }),
  });

  const isLoading = termIds.length > 0 && results.some((r) => r.isLoading);
  const data = isLoading
    ? undefined
    : Array.from(new Map(results.flatMap((r) => r.data ?? []).map((s) => [s.id, s])).values());
  return { data, isLoading };
}

/**
 * Approved Notes & Lab resources for one (branch, specialization, term)
 * combination + type ('notes' or 'lab_manual'). specializationId null
 * matches specialization_id is null (every non-CSE branch). Returned
 * unsorted-by-intent — the page does the subject-vs-time sort
 * client-side over this same fetched set, so toggling the sort control
 * doesn't cost another round trip.
 *
 * termId also accepts an array — Notes/PYQ's "All semesters" pick
 * (ALL_SEMESTERS in useBatchSemesterFilter) needs every semester
 * currently in view in one query (.in(...)), not a single .eq(...).
 */
export function useNotesAndLabResources(
  branchId: string | null,
  specializationId: string | null,
  termId: string | string[] | null,
  resourceType: ResourceType,
  // Optional — a FILTER, not a scoping dimension like branch/term.
  // Omitted (null) shows every batch's content for this scope, which
  // is what "browsing your year" meant before Batch existed and stays
  // the default now.
  batchId?: string | null
) {
  const termKey = Array.isArray(termId) ? [...termId].sort() : termId;
  const hasTerm = Array.isArray(termId) ? termId.length > 0 : !!termId;
  return useQuery({
    queryKey: ["resources", "notes_lab", branchId, specializationId, termKey, resourceType, batchId ?? null],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("resources")
        .select("*, subject:subjects(id, name, sort_order)")
        .eq("branch_id", branchId!)
        .eq("section", "notes_lab")
        .eq("resource_type", resourceType)
        .eq("status", "approved");
      query = specializationId ? query.eq("specialization_id", specializationId) : query.is("specialization_id", null);
      query = Array.isArray(termId) ? query.in("term_id", termId) : query.eq("term_id", termId!);
      if (batchId) query = query.eq("batch_id", batchId);
      const { data, error } = await query
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ResourceWithSubject[];
    },
    enabled: !!branchId && hasTerm,
    staleTime: 30_000,
  });
}

/**
 * PYQs are shared within one branch's specialization pool (see
 * pyqSharing.ts's pyqSharingSpecializationIds) WITHIN a term — never
 * across different real branches (a Civil PYQ has nothing to do with a
 * CSE student). hasSpecializations=false (every non-CSE branch) means
 * "match specialization_id is null" instead of an IN-list.
 *
 * termId also accepts an array — see useNotesAndLabResources's
 * identical note for why ("All semesters").
 */
export function usePyqResources(
  branchId: string | null,
  specializationIds: string[],
  hasSpecializations: boolean,
  termId: string | string[] | null,
  batchId?: string | null
) {
  const termKey = Array.isArray(termId) ? [...termId].sort() : termId;
  const hasTerm = Array.isArray(termId) ? termId.length > 0 : !!termId;
  const ready = hasSpecializations ? specializationIds.length > 0 : true;
  return useQuery({
    queryKey: ["resources", "pyq", branchId, [...specializationIds].sort(), termKey, batchId ?? null],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("resources")
        .select("*, subject:subjects(id, name, sort_order)")
        .eq("branch_id", branchId!)
        .eq("section", "pyq")
        .eq("status", "approved");
      query = hasSpecializations ? query.in("specialization_id", specializationIds) : query.is("specialization_id", null);
      query = Array.isArray(termId) ? query.in("term_id", termId) : query.eq("term_id", termId!);
      if (batchId) query = query.eq("batch_id", batchId);
      const { data, error } = await query
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ResourceWithSubject[];
    },
    enabled: !!branchId && hasTerm && ready,
    staleTime: 30_000,
  });
}

/**
 * Titles already published in the exact scope an upload is about to
 * land in — CRUploadForm checks a picked file's would-be title against
 * this before publishing, so re-uploading something from a past
 * session (not just this same browser tab) still gets flagged.
 * specializationIds is always applied now, PYQ included — for a PYQ
 * upload the caller passes the full pyqSharing.ts pool (not just the
 * one specialization on record), since a same-named PYQ in a DIFFERENT
 * sharing pool (e.g. AIDS vs. Core/AIML for 1st Year) isn't actually a
 * duplicate anymore, matching what usePyqResources itself now shows.
 * resourceTypes scopes by the actual resource_type(s), not just
 * section — without this, a PYQ Solution shared the same "already
 * uploaded" check as its question paper (same section, both "pyq"),
 * flagging one as a duplicate of the other even though they're
 * different resource_type values and not actually duplicates. Same
 * reasoning keeps Notes and Lab from colliding under "notes_lab".
 */
export function useExistingResourceTitles(
  section: "notes_lab" | "pyq" | null,
  resourceTypes: string[],
  branchId: string | null,
  specializationIds: string[],
  hasSpecializations: boolean,
  termId: string | null,
  subjectId: string | null,
  // Scopes the check to the batch actually being uploaded to — the
  // same title already existing in a DIFFERENT batch isn't really a
  // duplicate (that's a different cohort's copy of the same subject).
  batchId: string | null
) {
  return useQuery({
    queryKey: [
      "resources",
      "titles",
      section,
      resourceTypes,
      branchId,
      specializationIds,
      termId,
      subjectId,
      batchId,
    ],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("resources")
        .select("title")
        .eq("branch_id", branchId!)
        .eq("term_id", termId!)
        .eq("batch_id", batchId!)
        .eq("section", section!)
        .eq("status", "approved")
        .in("resource_type", resourceTypes);
      query = hasSpecializations ? query.in("specialization_id", specializationIds) : query.is("specialization_id", null);
      query = subjectId ? query.eq("subject_id", subjectId) : query.is("subject_id", null);
      const { data, error } = await query;
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.title.trim().toLowerCase()));
    },
    enabled:
      !!branchId &&
      !!termId &&
      !!batchId &&
      !!section &&
      (!hasSpecializations || specializationIds.length > 0) &&
      resourceTypes.length > 0,
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
