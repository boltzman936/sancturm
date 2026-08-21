"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useTerms } from "@/features/terms/queries";
import { useBatches } from "@/features/batches/queries";
import type { ResourceType, Subject } from "./types";
import type { ResourceWithSubject } from "./queries";

// The one, permanent historical exception: 2025-26's own 1st Year
// (Sem 1 + Sem 2) pools Notes/Lab/PYQ/Solution resources across EVERY
// branch and specialization by canonical subject identity — matches
// this codebase's existing "small, explicit, hardcoded business rule"
// shape (see pyqSharing.ts's Core/AIML pool, academicChronology.ts's
// Cyber Security carve-out), not a general cross-branch sharing
// capability. Never applies to any other batch or year — every check
// below fails closed (returns nothing extra) the instant either
// condition isn't met, rather than degrading to "share everything."
export const HISTORICAL_SHARING_BATCH_LABEL = "2025-26";
export const HISTORICAL_SHARING_YEAR_NUMBER = 1;

export function isHistoricalSharingYear(yearNumber: number | undefined): boolean {
  return yearNumber === HISTORICAL_SHARING_YEAR_NUMBER;
}

// Wider than ResourceWithSubject's own `subject` shape (id/name/
// sort_order only) — this internal fetch needs canonical_subject_id
// too, purely to resolve which of the VIEWER's own local subjects a
// shared-in resource should be relabeled to before it's handed back
// out as a normal ResourceWithSubject (see mergeHistoricalShared).
type SharedResource = Omit<ResourceWithSubject, "subject"> & {
  subject: Pick<Subject, "id" | "name" | "sort_order" | "canonical_subject_id"> | null;
};

/**
 * Resources shared IN to the viewer's own context from OTHER (branch,
 * specialization, semester) contexts within 2025-26's own 1st Year,
 * purely by canonical_subject_id — never by name, and never touching
 * a resource's own stored branch_id/specialization_id/term_id/
 * subject_id (no rows are duplicated, moved, or re-owned; this is a
 * read-time expansion only). Returns `[]` — not an error, not a
 * loading state — the instant any precondition fails: wrong year,
 * batch filter set to something other than "All batches" or 2025-26
 * itself, or the viewer's own local subjects have no canonical link
 * to expand from at all.
 *
 * Pass the result straight to mergeHistoricalSharedResources, which
 * dedupes against the caller's own normal same-context fetch and
 * relabels each shared-in resource's subject to the viewer's own.
 */
export function useHistoricalSharedResources({
  localSubjects,
  section,
  resourceType,
  yearNumber,
  batchFilterIsAllOrHistorical,
}: {
  // The viewer's own subjects for their currently-selected context —
  // already fetched by the calling page (useSubjects et al.); this
  // hook never fetches its own "what subjects does the viewer have"
  // query, so it can't drift from what the page is actually showing.
  localSubjects: Pick<Subject, "id" | "canonical_subject_id">[] | undefined;
  section: "notes_lab" | "pyq";
  resourceType: ResourceType;
  yearNumber: number | undefined;
  // True when the viewer's Batch filter is either "All batches" or
  // explicitly 2025-26 — false for any OTHER specific batch (e.g.
  // 2026-27), where sharing IN 2025-26-dated content would contradict
  // the batch filter the viewer just picked.
  batchFilterIsAllOrHistorical: boolean;
}) {
  const { data: allTerms } = useTerms();
  const { data: allBatches } = useBatches();

  const year1TermIds = useMemo(
    () => (allTerms ?? []).filter((t) => t.year_number === HISTORICAL_SHARING_YEAR_NUMBER).map((t) => t.id),
    [allTerms]
  );
  const historicalBatchId = useMemo(
    () => allBatches?.find((b) => b.label === HISTORICAL_SHARING_BATCH_LABEL)?.id ?? null,
    [allBatches]
  );
  const canonicalIds = useMemo(
    () =>
      Array.from(
        new Set((localSubjects ?? []).map((s) => s.canonical_subject_id).filter((id): id is string => !!id))
      ).sort(),
    [localSubjects]
  );

  const enabled =
    isHistoricalSharingYear(yearNumber) &&
    batchFilterIsAllOrHistorical &&
    !!historicalBatchId &&
    year1TermIds.length > 0 &&
    canonicalIds.length > 0;

  return useQuery({
    queryKey: [
      "resources",
      "historical-shared",
      section,
      resourceType,
      canonicalIds,
      historicalBatchId,
      year1TermIds,
    ],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("resources")
        .select("*, subject:subjects!inner(id, name, sort_order, canonical_subject_id)")
        .in("subject.canonical_subject_id", canonicalIds)
        .in("subject.term_id", year1TermIds)
        .eq("section", section)
        .eq("resource_type", resourceType)
        .eq("status", "approved")
        .eq("batch_id", historicalBatchId!);
      if (error) throw error;
      return data as unknown as SharedResource[];
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Merges a base (own-context) resource fetch with the historical
 * shared-in set — gap-filling only, not full pooling: a canonical
 * subject that already has at least one of the viewer's OWN resources
 * (of the SAME resource_type) never pulls in anyone else's copies,
 * even if others exist. Without this, a subject every branch already
 * uploads independently (Professional Communication, Manufacturing —
 * the common case, confirmed live: 7 near-identical "PC FOR EXAM"
 * cards, one per branch) would flood the viewer's own list with near-
 * duplicate-looking cards instead of the intended behavior — filling
 * in a subject a context genuinely has NO content for, the way
 * Biotechnology's own missing Chemistry lab content gets filled from
 * CSE AIDS's upload.
 *
 * Each admitted shared-in resource's `subject` is relabeled to
 * whichever of the viewer's OWN local subject rows shares its
 * canonical id — so a card viewed from Biotechnology shows
 * "Chemistry" (Biotechnology's own subject row/name), never the
 * originating CSE AIDS context's own subject name, even though the
 * underlying resource row is completely untouched. A shared resource
 * whose canonical id has no matching local subject (shouldn't happen,
 * since useHistoricalSharedResources only ever fetches via that exact
 * link) is dropped rather than shown mislabeled.
 */
export function mergeHistoricalSharedResources<T extends ResourceWithSubject>(
  ownResources: T[] | undefined,
  sharedResources: SharedResource[] | undefined,
  localSubjects: Subject[] | undefined
): T[] {
  const own = ownResources ?? [];
  const shared = sharedResources ?? [];
  if (shared.length === 0) return own;

  const ownIds = new Set(own.map((r) => r.id));
  const localByCanonical = new Map(
    (localSubjects ?? [])
      .filter((s) => !!s.canonical_subject_id)
      .map((s) => [s.canonical_subject_id as string, s] as const)
  );
  const localSubjectById = new Map((localSubjects ?? []).map((s) => [s.id, s] as const));
  // Canonical ids the viewer already has at least one own resource
  // for, split by resource_type — Notes and Lab are independent gaps
  // (a branch can have its own Chemistry notes but no Chemistry lab
  // content, or vice versa), so "already covered" is checked per type,
  // not per subject alone.
  const ownCanonicalCoverage = new Set(
    own
      .map((r) => {
        const subjectId = r.subject?.id;
        const canonicalId = subjectId ? localSubjectById.get(subjectId)?.canonical_subject_id : null;
        return canonicalId ? `${canonicalId}:${r.resource_type}` : null;
      })
      .filter((key): key is string => !!key)
  );

  const relabeledShared: T[] = [];
  for (const r of shared) {
    if (ownIds.has(r.id)) continue; // already covered by the own-context fetch
    const canonicalId = r.subject?.canonical_subject_id ?? null;
    if (!canonicalId) continue;
    if (ownCanonicalCoverage.has(`${canonicalId}:${r.resource_type}`)) continue; // gap already filled locally
    const localSubject = localByCanonical.get(canonicalId);
    if (!localSubject) continue; // defensive — see this function's own comment
    relabeledShared.push({
      ...r,
      subject: { id: localSubject.id, name: localSubject.name, sort_order: localSubject.sort_order },
    } as T);
  }

  return [...own, ...relabeledShared];
}
