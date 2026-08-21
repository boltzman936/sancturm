"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ResourceType, Subject } from "./types";
import type { ResourceWithSubject } from "./queries";

// Centralized PYQs (see supabase/centralize_pyq_resources.sql) — a
// resource with canonical_subject_id set is visible everywhere a
// subject sharing that canonical id reaches, for EVERY batch/year, not
// just historicalSharing.ts's narrow 2025-26/Year-1 exception. Unlike
// that file, no gap-filling logic is needed here: a centralized PYQ is
// already exactly one row per real paper (enforced at upload time, see
// actions.ts), so every match is simply included — there's nothing to
// dedupe against "the viewer's own copy," because there is no
// per-context copy anymore.
type CentralizedResource = Omit<ResourceWithSubject, "subject"> & {
  subject: Pick<Subject, "id" | "name" | "sort_order" | "canonical_subject_id"> | null;
};

export function useCanonicalPyqResources({
  localSubjects,
  resourceType,
}: {
  // The viewer's own subjects for their currently-selected context —
  // same convention as useHistoricalSharedResources.
  localSubjects: Pick<Subject, "id" | "canonical_subject_id">[] | undefined;
  resourceType: ResourceType;
}) {
  const canonicalIds = useMemo(
    () =>
      Array.from(
        new Set((localSubjects ?? []).map((s) => s.canonical_subject_id).filter((id): id is string => !!id))
      ).sort(),
    [localSubjects]
  );

  return useQuery({
    queryKey: ["resources", "canonical-pyq", resourceType, canonicalIds],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("resources")
        .select("*, subject:subjects(id, name, sort_order, canonical_subject_id)")
        .in("canonical_subject_id", canonicalIds)
        .eq("section", "pyq")
        .eq("resource_type", resourceType)
        .eq("status", "approved");
      if (error) throw error;
      return data as unknown as CentralizedResource[];
    },
    enabled: canonicalIds.length > 0,
    staleTime: 30_000,
  });
}

/**
 * Relabels each centralized resource's `subject` to the VIEWER's own
 * local subject sharing its canonical id (same relabeling convention
 * as mergeHistoricalSharedResources) and merges with the caller's
 * other resource sets, deduping by id — a resource can't legitimately
 * appear in two of the sets at once, but different queries could
 * theoretically race/overlap during a migration window.
 */
export function mergeCanonicalPyqResources<T extends ResourceWithSubject>(
  resourceSets: (T[] | CentralizedResource[] | undefined)[],
  localSubjects: Subject[] | undefined
): T[] {
  const localByCanonical = new Map(
    (localSubjects ?? [])
      .filter((s) => !!s.canonical_subject_id)
      .map((s) => [s.canonical_subject_id as string, s] as const)
  );

  const seen = new Set<string>();
  const merged: T[] = [];
  for (const set of resourceSets) {
    for (const r of set ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const canonicalId = (r.subject as { canonical_subject_id?: string | null } | null)?.canonical_subject_id;
      if (canonicalId) {
        const localSubject = localByCanonical.get(canonicalId);
        if (localSubject) {
          merged.push({
            ...r,
            subject: { id: localSubject.id, name: localSubject.name, sort_order: localSubject.sort_order },
          } as T);
          continue;
        }
      }
      merged.push(r as T);
    }
  }
  return merged;
}
