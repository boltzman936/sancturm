"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { AcademicTerm } from "@/types/database";

/**
 * Every academic term that exists — same "database is the source of
 * truth, adding a new one is an INSERT, not a code change" reasoning
 * as useBranches(). Right now that's just "1st Year - Sem 1" and
 * "2nd Year - Sem 3"; a future "1st Year - Sem 2" (once those
 * students progress) shows up here automatically once it exists.
 */
export function useTerms() {
  return useQuery({
    queryKey: ["terms"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("academic_terms").select("*").order("sort_order");
      if (error) throw error;
      return data as AcademicTerm[];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Resolves the slug stored by useTerm() (e.g. "y2-s3") into the
 * actual term row — every branch/subject/resource query needs the
 * real term_id, not the slug.
 */
export function useTermBySlug(slug: string | null) {
  return useQuery({
    queryKey: ["term", slug],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("academic_terms")
        .select("*")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data as AcademicTerm;
    },
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });
}
