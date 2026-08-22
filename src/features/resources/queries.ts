"use client";

import { useQueries, useQuery, useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Resource, ResourceType, Subject } from "./types";

export type ResourceWithSubject = Resource & {
  subject: Pick<Subject, "id" | "name" | "sort_order"> | null;
};

/**
 * Subjects for one (branch, specialization, term) combination, ordered
 * the way the CR arranged them. specializationId is null for any
 * branch with no specialization concept (everything but CSE) — those
 * subjects are matched with `specialization_id is null`. Every
 * (branch, specialization, term) has its own explicit, permanent
 * subject rows — no dynamic redirect or cross-branch derivation.
 */
export function useSubjects(branchId: string | null, specializationId: string | null, termId: string | null) {
  return useQuery({
    queryKey: ["subjects", branchId, specializationId, termId],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from("subjects").select("*").eq("branch_id", branchId!).eq("term_id", termId!);
      query = specializationId ? query.eq("specialization_id", specializationId) : query.is("specialization_id", null);
      const { data, error } = await query.order("sort_order", { ascending: true });
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
 * Every subject across every branch AND specialization, for a SET of
 * terms — Manage's admin-wide "All years" filter genuinely wants
 * everything, since admin manages every branch at once, and a Year can
 * span more than one semester (per the Batch/Semester feature), so a
 * single termId isn't enough on its own. Not used for PYQ's own
 * subject filter (see useSubjectsForPyqScope below) — a student's PYQ
 * view should only ever see subjects from their own branch's sharing
 * pool, not every branch in the college. Uses useQueries (not a loop
 * of individual per-term queries, which would violate rules of hooks
 * against a dynamic-length term list) — fires every term's query in
 * parallel, not a sequential waterfall.
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
 * Manage's admin-wide filter and so isn't reusable here as-is. Shares
 * useSubjects' exact query key shape per term, so results aren't
 * double-fetched.
 */
export function useSubjectsForBranchAndTerms(
  branchId: string | null,
  specializationId: string | null,
  termIds: string[]
) {
  const results = useQueries({
    queries: termIds.map((termId) => ({
      queryKey: ["subjects", branchId, specializationId, termId],
      queryFn: async () => {
        const supabase = createClient();
        let query = supabase.from("subjects").select("*").eq("branch_id", branchId!).eq("term_id", termId);
        query = specializationId ? query.eq("specialization_id", specializationId) : query.is("specialization_id", null);
        const { data, error } = await query.order("sort_order", { ascending: true });
        if (error) throw error;
        return data as Subject[];
      },
      enabled: !!branchId,
      staleTime: 5 * 60_000,
    })),
  });

  const isLoading = termIds.length > 0 && results.some((r) => r.isLoading);
  const data = isLoading ? undefined : results.flatMap((r) => r.data ?? []);
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
 *
 * Every resource belongs to exactly the (branch, specialization, term,
 * subject) it was uploaded with — no cross-branch or cross-semester
 * query. Content that's the same across multiple academic contexts
 * (e.g. the 2025-26 batch's initial Engineering Mechanics notes) exists
 * as its own independent row per context (see supabase/
 * initialize_2025_26_shared_content.sql) rather than being resolved
 * dynamically at read time.
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
 * CSE student's own upload).
 * hasSpecializations=false (every non-CSE branch) means "match
 * specialization_id is null" instead of an IN-list.
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
      const resources = data as unknown as (ResourceWithSubject & { content_hash: string | null })[];

      // The specialization pool (e.g. Core+AIML) is an IN-list against
      // ONE resources table, so a resource with no subject (the
      // "Extra" bucket, applies to a whole specialization rather than
      // one subject) that was uploaded once and fanned out into a row
      // per specialization — the upload form's own normal behavior for
      // an "all subjects" pick — comes back as multiple rows the
      // moment those specializations pool together, even though they
      // all point at the exact same underlying file. content_hash is
      // the same for all of them in that case, so dedupe on it
      // (keeping the first — already sorted pinned-then-newest-first)
      // rather than on id, which is deliberately different per row.
      const seenHashes = new Set<string>();
      return resources.filter((r) => {
        if (!r.content_hash) return true;
        if (seenHashes.has(r.content_hash)) return false;
        seenHashes.add(r.content_hash);
        return true;
      });
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
    // No onSuccess invalidation — deliberately. download_count/
    // view_count aren't rendered anywhere in the UI (grep confirms:
    // only ever read back via the database types, never displayed),
    // so there's nothing on screen this counter bump needs to refresh.
    // This used to invalidate the entire "resources" query prefix,
    // which matches every resources-namespaced query mounted on the
    // page (Notes, PYQs, canonical PYQ, existing-title checks) —
    // meaning View/Download, the single most common interaction on
    // the whole site, silently triggered a full list refetch + re-
    // render every single click. Fire-and-forget really means
    // fire-and-forget here.
  });
}

// ---- Centralized PYQ subject picker ----

export type CanonicalSubjectOption = { id: string; canonical_name: string };

/**
 * Every canonical subject, unrestricted — the PYQ upload/edit picker's
 * source for an admin, who can centralize a PYQ against any subject in
 * the college, not just their own branch's.
 */
export function useCanonicalSubjects() {
  return useQuery({
    queryKey: ["canonical-subjects", "all"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("canonical_subjects")
        .select("id, canonical_name")
        .order("canonical_name", { ascending: true });
      if (error) throw error;
      return data as CanonicalSubjectOption[];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Canonical subjects reachable from one (branch, specialization pool,
 * term) — a CR's own upload picker. A CR can still only centralize a
 * PYQ against a subject that actually exists somewhere in their own
 * academic context; they just no longer have to re-upload it once per
 * context that shares it. specializationIds empty + hasSpecializations
 * false means "specialization_id is null" (same convention as
 * useSubjects).
 */
export function useCanonicalSubjectsForScope(
  branchId: string | null,
  specializationIds: string[],
  hasSpecializations: boolean,
  termId: string | null
) {
  return useQuery({
    queryKey: ["canonical-subjects", "scope", branchId, [...specializationIds].sort(), hasSpecializations, termId],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("subjects")
        .select("canonical_subject_id, canonical_subjects!inner(id, canonical_name)")
        .eq("branch_id", branchId!)
        .eq("term_id", termId!)
        .not("canonical_subject_id", "is", null);
      query = hasSpecializations ? query.in("specialization_id", specializationIds) : query.is("specialization_id", null);
      const { data, error } = await query;
      if (error) throw error;
      const seen = new Map<string, CanonicalSubjectOption>();
      for (const row of data ?? []) {
        const cs = (row as unknown as { canonical_subjects: CanonicalSubjectOption }).canonical_subjects;
        if (cs) seen.set(cs.id, cs);
      }
      return Array.from(seen.values()).sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
    },
    enabled: !!branchId && !!termId && (!hasSpecializations || specializationIds.length > 0),
    staleTime: 5 * 60_000,
  });
}

/**
 * Duplicate guard for a centralized PYQ upload — scoped purely by
 * canonical_subject_id (never branch/term/batch, unlike
 * useExistingResourceTitles), since a centralized PYQ is meant to be
 * the same one row regardless of which context it's uploaded from.
 */
export function useExistingCanonicalPyqTitles(canonicalSubjectId: string | null, resourceTypes: string[]) {
  return useQuery({
    queryKey: ["resources", "titles", "canonical", canonicalSubjectId, resourceTypes],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("resources")
        .select("title")
        .eq("canonical_subject_id", canonicalSubjectId!)
        .eq("status", "approved")
        .in("resource_type", resourceTypes);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.title.trim().toLowerCase()));
    },
    enabled: !!canonicalSubjectId && resourceTypes.length > 0,
    staleTime: 15_000,
  });
}
