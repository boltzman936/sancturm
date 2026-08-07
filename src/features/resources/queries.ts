"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Resource, ResourceType, Subject } from "./types";

export type ResourceWithSubject = Resource & {
  subject: Pick<Subject, "id" | "name" | "sort_order"> | null;
};

/** Subjects for one branch, ordered the way the CR arranged them. */
export function useSubjects(branchId: string | null) {
  return useQuery({
    queryKey: ["subjects", branchId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("branch_id", branchId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Subject[];
    },
    enabled: !!branchId,
    // Subjects only change when a CR restructures the syllabus list —
    // near-static reference data, same reasoning as useBranchBySlug.
    staleTime: 5 * 60_000,
  });
}

/**
 * Approved Notes & Lab resources for one branch + type ('notes' or
 * 'lab_manual'). Returned unsorted-by-intent — the page does the
 * subject-vs-time sort client-side over this same fetched set, so
 * toggling the sort control doesn't cost another network round trip.
 */
export function useNotesAndLabResources(branchId: string | null, resourceType: ResourceType) {
  return useQuery({
    queryKey: ["resources", "notes_lab", branchId, resourceType],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("resources")
        .select("*, subject:subjects(id, name, sort_order)")
        .eq("branch_id", branchId!)
        .eq("section", "notes_lab")
        .eq("resource_type", resourceType)
        .eq("status", "approved")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ResourceWithSubject[];
    },
    enabled: !!branchId,
    staleTime: 30_000,
  });
}

/**
 * PYQs are shared across every CSE branch for this term (see
 * supabase/pyq_cross_branch.sql) — deliberately NOT filtered by
 * branch_id, unlike useNotesAndLabResources. A PYQ uploaded by any
 * branch's CR shows up for every branch's students.
 */
export function usePyqResources() {
  return useQuery({
    queryKey: ["resources", "pyq"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("resources")
        .select("*, subject:subjects(id, name, sort_order)")
        .eq("section", "pyq")
        .eq("status", "approved")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ResourceWithSubject[];
    },
    staleTime: 30_000,
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
