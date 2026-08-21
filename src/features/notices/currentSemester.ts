"use client";

import { useMemo } from "react";
import { useTerms } from "@/features/terms/queries";
import { YEAR_TO_CURRENT_SEMESTER_NUMBER } from "./activeNoticeContexts";

/**
 * Resolves the viewer's sidebar Year straight to the one live Notice
 * term_id, with no batch/date computation at all — undefined while
 * academic_terms is still loading, null if this Year has no current
 * Notice context (any year other than the two above).
 */
export function useCurrentNoticeTermId(yearNumber: number | undefined): string | null | undefined {
  const { data: allTerms } = useTerms();
  return useMemo(() => {
    if (yearNumber === undefined) return undefined;
    const semesterNumber = YEAR_TO_CURRENT_SEMESTER_NUMBER[yearNumber];
    if (semesterNumber === undefined) return null;
    if (!allTerms) return undefined;
    const term = allTerms.find((t) => t.year_number === yearNumber && t.semester_number === semesterNumber);
    return term?.id ?? null;
  }, [yearNumber, allTerms]);
}
