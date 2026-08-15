"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/date";
import { isDateReached } from "@/features/batches/academicChronology";
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
 *
 * Built on useTerms() rather than its own fetch-by-slug query — same
 * reasoning as useBranchBySlug: academic_terms is 2 rows, and a
 * separate per-slug fetch just stacked a second network round trip
 * after the term switcher's own useTerms() call fetched the identical
 * data moments earlier. One shared, deduped query instead of two
 * sequential ones.
 */
export function useTermBySlug(slug: string | null) {
  const query = useTerms();
  return { ...query, data: slug ? query.data?.find((t) => t.slug === slug) : undefined };
}

/**
 * Exactly one term per year_number — whichever one is CURRENT right
 * now, resolved from batch_terms' real calendar dates. Before Batch
 * existed, every year mapped to exactly one term 1:1, so
 * TermSelectCard/TermSwitcher could just list every row from
 * useTerms() and show its year. Now that a year can have several
 * terms (Sem 1 AND Sem 2, across multiple batches), listing every raw
 * term there would show "1st Year" duplicated once per semester/batch
 * combination — this resolves that back down to one entry per year,
 * so the "pick your year" flow students already know is completely
 * unchanged. useTerms() itself is untouched and still returns every
 * term for callers that genuinely need the full list (Manage's Year
 * filter, the upload form's Year picker, both of which SHOULD offer
 * every semester, not just the current one).
 */
export function useCurrentTermsByYear() {
  return useQuery({
    queryKey: ["terms", "current-by-year"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("batch_terms")
        .select("start_date, term:academic_terms(*)")
        .order("start_date", { ascending: true });
      if (error) throw error;

      const todayKey = localDateKey(new Date().toISOString());
      const byYear = new Map<number, AcademicTerm>();
      for (const row of data ?? []) {
        const term = (Array.isArray(row.term) ? row.term[0] : row.term) as AcademicTerm | null;
        if (!term) continue;
        const alreadyStarted = isDateReached(row.start_date, todayKey);
        // First row seen for a year always fills the slot (so a year
        // with only future semesters still shows its soonest upcoming
        // one) — after that, only a row that's actually started can
        // overwrite it. Ascending order means the LAST started row we
        // see for a year is the most recently begun one, i.e. current.
        if (!byYear.has(term.year_number) || alreadyStarted) {
          byYear.set(term.year_number, term);
        }
      }
      return [...byYear.values()].sort((a, b) => a.year_number - b.year_number);
    },
    staleTime: 5 * 60_000,
  });
}
